"""Comick (https://comick.io) — agregador com API JSON pública.

Endpoints relevantes (https://api.comick.fun):

  GET /v1.0/search?q=<query>&limit=20         lista de obras
  GET /comic/<slug>                           detalhes da obra
  GET /comic/<slug>/chapters?lang=pt-br&limit=200&page=1
  GET /chapter/<hid>?tachiyomi=true           inclui URLs das páginas

Comick usa um "hid" (hash id) curto pra capítulos e um "slug" longo pra obras.
Mantemos `external_id` = slug pra mangas e `external_id` = hid pra capítulos.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


class ComickSource(BaseSource):
    id = "comick"
    name = "Comick"
    base_url = "https://api.comick.fun"
    languages = ["pt-br", "en", "es-la", "ja-ro"]
    kind = "api"

    SITE_URL = "https://comick.io"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={"Accept": "application/json"},
        )

    # ---------- search & detail ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        try:
            resp = self.client.get(
                "/v1.0/search",
                endpoint="search",
                params={"q": query, "limit": 20, "page": page},
            )
        except SourceHTTPError:
            return []
        try:
            payload = resp.json()
        except ValueError:
            return []
        items = payload if isinstance(payload, list) else payload.get("data", [])
        return [self._to_manga_dto(item) for item in items]

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(f"/comic/{external_id}", endpoint="manga")
            data = resp.json()
        except (SourceHTTPError, ValueError):
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        comic = data.get("comic") or data
        return self._to_manga_dto(comic, full=True)

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        out: list[ChapterDTO] = []
        page = 1
        lang = language or "pt-br"
        while page <= 50:  # safety
            try:
                resp = self.client.get(
                    f"/comic/{external_id}/chapters",
                    endpoint="chapters",
                    params={"lang": lang, "limit": 200, "page": page},
                )
                payload = resp.json()
            except (SourceHTTPError, ValueError):
                break
            chapters = payload.get("chapters") or []
            if not chapters:
                break
            for ch in chapters:
                dto = self._to_chapter_dto(ch, lang)
                if dto:
                    out.append(dto)
            if len(chapters) < 200:
                break
            page += 1
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            resp = self.client.get(
                f"/chapter/{chapter_external_id}",
                endpoint="pages",
                params={"tachiyomi": "true"},
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        chapter = payload.get("chapter") or {}
        images = chapter.get("md_images") or chapter.get("images") or []
        out: list[PageDTO] = []
        for i, img in enumerate(images):
            url = img.get("url")
            if not url:
                key = img.get("b2key") or img.get("key")
                if key:
                    url = f"https://meo.comick.pictures/{key}"
            if not url:
                continue
            out.append(PageDTO(index=i, url=url))
        return out

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/v1.0/search",
                endpoint="healthcheck",
                params={"q": "naruto", "limit": 1},
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
        except ValueError:
            payload = []
        items = payload if isinstance(payload, list) else payload.get("data", [])
        return HealthResult(
            success=resp.status_code < 400,
            latency_ms=latency,
            status_code=resp.status_code,
            extracted_count=len(items),
        )

    # ---------- DTO mapping ----------

    def _to_manga_dto(self, item: dict, *, full: bool = False) -> MangaDTO:
        slug = item.get("slug") or item.get("hid") or ""
        title = item.get("title") or "(sem título)"
        cover = ""
        md_covers = item.get("md_covers") or []
        if md_covers:
            b2 = md_covers[0].get("b2key")
            if b2:
                cover = f"https://meo.comick.pictures/{b2}"
        elif item.get("cover_url"):
            cover = item["cover_url"]
        status_map = {1: "ongoing", 2: "completed", 3: "hiatus", 4: "completed"}
        raw_status = item.get("status")
        status = status_map.get(raw_status, "")
        rating_raw = (item.get("content_rating") or "safe").lower()
        rating = rating_raw if rating_raw in {"safe", "suggestive", "erotica", "pornographic"} else "safe"
        desc = item.get("desc") or item.get("description") or ""
        return MangaDTO(
            external_id=slug,
            title=title,
            url=f"{self.SITE_URL}/comic/{slug}",
            cover_url=cover,
            description=desc,
            status=status,
            content_rating=rating,
            languages=[(item.get("country") or "").lower()] if item.get("country") else [],
        )

    def _to_chapter_dto(self, ch: dict, lang: str) -> Optional[ChapterDTO]:
        hid = ch.get("hid")
        if not hid:
            return None
        try:
            number = float(ch.get("chap") or 0)
        except (TypeError, ValueError):
            number = 0.0
        return ChapterDTO(
            external_id=hid,
            number=number,
            title=ch.get("title") or "",
            language=lang,
            scanlator=", ".join(g.get("name", "") for g in (ch.get("group_name") or [])) if isinstance(ch.get("group_name"), list) else "",
            url=f"{self.SITE_URL}/comic/_/{hid}",
        )
