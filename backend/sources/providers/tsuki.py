"""Tsuki Mangás (https://tsuki-mangas.com).

Catálogo BR top-tier. O frontend Next.js do site consome `/api/v2/` (descoberto
via DevTools, não documentado mas estável há ~2 anos):

  GET /api/v2/mangas/search?title=<q>&page=1
  GET /api/v2/mangas/<id>
  GET /api/v2/chapter/versions/<manga_id>?page=1   capítulos paginados
  GET /api/v2/chapter/versions/<version_id>/pages  páginas de um capítulo

Nota operacional: Tsuki tem Cloudflare leve, nem sempre exige challenge.
Quando exige, esse provider vai degradar — o health check captura isso e
o painel admin sinaliza como DOWN. Refazer com Playwright é trabalho futuro.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


class TsukiSource(BaseSource):
    id = "tsuki"
    name = "Tsuki Mangás"
    base_url = "https://tsuki-mangas.com"
    languages = ["pt-br"]
    kind = "api"

    API_BASE = "https://tsuki-mangas.com/api/v2"
    CDN_BASE = "https://cdn.tsuki-mangas.com"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.API_BASE,
            default_headers={
                "Accept": "application/json",
                "Origin": self.base_url,
                "Referer": self.base_url + "/",
            },
        )

    # ---------- search & detail ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        try:
            resp = self.client.get(
                "/mangas/search",
                endpoint="search",
                params={"title": query, "page": page},
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        items = payload.get("data") or payload.get("mangas") or payload if isinstance(payload, list) else payload.get("data", [])
        if isinstance(items, dict):
            items = items.get("data", [])
        return [self._to_manga_dto(m) for m in items if isinstance(m, dict)]

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(f"/mangas/{external_id}", endpoint="manga")
            data = resp.json()
        except (SourceHTTPError, ValueError):
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        return self._to_manga_dto(data)

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        out: list[ChapterDTO] = []
        page = 1
        while page <= 50:
            try:
                resp = self.client.get(
                    f"/chapter/versions/{external_id}",
                    endpoint="chapters",
                    params={"page": page},
                )
                payload = resp.json()
            except (SourceHTTPError, ValueError):
                break
            items = payload.get("data") or []
            if not items:
                break
            for ch in items:
                dto = self._to_chapter_dto(ch)
                if dto:
                    out.append(dto)
            if len(items) < 30:
                break
            page += 1
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            resp = self.client.get(
                f"/chapter/versions/{chapter_external_id}/pages",
                endpoint="pages",
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        items = payload if isinstance(payload, list) else payload.get("pages") or payload.get("data") or []
        out: list[PageDTO] = []
        for i, p in enumerate(items):
            if isinstance(p, str):
                url = p
            else:
                url = p.get("url") or p.get("image") or p.get("src") or ""
                if url and not url.startswith("http"):
                    url = f"{self.CDN_BASE}/{url.lstrip('/')}"
            if url:
                out.append(PageDTO(index=i, url=url, headers={"Referer": self.base_url + "/"}))
        return out

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/mangas/search",
                endpoint="healthcheck",
                params={"title": "naruto", "page": 1},
                record_telemetry=False,
            )
        except SourceHTTPError as exc:
            return HealthResult(
                success=False,
                latency_ms=int((time.monotonic() - t0) * 1000),
                status_code=exc.status_code,
                error_class=exc.error_class,
                error_message=str(exc)[:500],
                extracted_count=0,
            )
        latency = int((time.monotonic() - t0) * 1000)
        try:
            payload = resp.json()
            items = payload.get("data") if isinstance(payload, dict) else payload
            count = len(items) if isinstance(items, list) else 0
        except ValueError:
            count = 0
        return HealthResult(
            success=resp.status_code < 400,
            latency_ms=latency,
            status_code=resp.status_code,
            extracted_count=count,
        )

    # ---------- DTO mapping ----------

    def _to_manga_dto(self, item: dict) -> MangaDTO:
        mid = str(item.get("id") or item.get("manga_id") or "")
        title = item.get("title") or item.get("name") or "(sem título)"
        cover = item.get("poster") or item.get("cover") or ""
        if cover and not cover.startswith("http"):
            cover = f"{self.CDN_BASE}/{cover.lstrip('/')}"
        status_raw = (item.get("status") or "").lower()
        status_map = {
            "ativo": "ongoing", "em lançamento": "ongoing",
            "completo": "completed", "completed": "completed", "finalizado": "completed",
            "hiato": "hiatus", "pausado": "hiatus",
        }
        status = status_map.get(status_raw, "")
        return MangaDTO(
            external_id=mid,
            title=title,
            url=f"{self.base_url}/obra/{mid}/{item.get('url') or ''}".rstrip("/"),
            cover_url=cover,
            description=item.get("synopsis") or item.get("description") or "",
            author=item.get("author") or "",
            artist=item.get("artist") or "",
            status=status,
            languages=["pt-br"],
        )

    def _to_chapter_dto(self, ch: dict) -> Optional[ChapterDTO]:
        cid = str(ch.get("id") or ch.get("version_id") or "")
        if not cid:
            return None
        try:
            number = float(ch.get("number") or ch.get("chapter") or 0)
        except (TypeError, ValueError):
            number = 0.0
        return ChapterDTO(
            external_id=cid,
            number=number,
            title=ch.get("title") or "",
            language="pt-br",
            scanlator=ch.get("scan") or ch.get("group") or "",
            url=ch.get("url") or "",
        )
