"""MANGA Plus by SHUEISHA (https://mangaplus.shueisha.co.jp).

Plataforma oficial Shueisha — sem questões de copyright. Disponível em
inglês, espanhol-LA, português-BR, francês, indonésio, vietnamita, tailandês
e russo. A API oficial usa protobuf binário, mas o backend aceita um query
parameter `?format=json` que devolve JSON estruturado — usamos esse caminho.

Endpoints utilizados:

  GET https://jumpg-webapi.tokyo-cdn.com/api/title_list/allV2?format=json
      → catálogo completo (~250 títulos), 1 só payload de ~270KB.
      Usado para `search()` (filtragem client-side por substring).

  GET .../api/title_detailV3?title_id=<id>&format=json
      → detalhes de um título incluindo lista de capítulos.

  GET .../api/manga_viewer?chapter_id=<id>&split=yes&img_quality=high&format=json
      → URLs assinadas das páginas de um capítulo (links com expiry curto).

Search é client-side: baixamos o catálogo e filtramos por substring no
`name`/`author`. Como a Mangaplus tem catálogo enxuto (~250 títulos),
isso é simples e barato (cache de 30min em Redis).
"""

from __future__ import annotations

import logging
import time
from typing import Optional
from urllib.parse import urljoin

from django.core.cache import cache

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


# Cache do catálogo completo. 250 títulos ~270KB de JSON — vale guardar.
_CATALOG_CACHE_KEY = "sources:mangaplus:catalog_v2"
_CATALOG_TTL_SECONDS = 30 * 60  # 30 min


class MangaPlusSource(BaseSource):
    id = "mangaplus"
    name = "MANGA Plus (Shueisha)"
    base_url = "https://jumpg-webapi.tokyo-cdn.com/api"
    languages = ["en", "es-la", "pt-br", "fr", "id", "vi", "th", "ru"]
    kind = "api"

    SITE_URL = "https://mangaplus.shueisha.co.jp"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={
                "Accept": "application/json",
                "Origin": self.SITE_URL,
                "Referer": self.SITE_URL + "/",
            },
        )

    # ---------- catalog (cached) ----------

    def _fetch_catalog(self) -> list[dict]:
        cached = cache.get(_CATALOG_CACHE_KEY)
        if cached is not None:
            return cached
        try:
            resp = self.client.get(
                "/title_list/allV2",
                endpoint="catalog",
                params={"format": "json"},
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        groups = (
            payload.get("success", {})
            .get("allTitlesViewV2", {})
            .get("AllTitlesGroup", [])
        )
        catalog: list[dict] = []
        for g in groups:
            for t in g.get("titles") or []:
                catalog.append(t)
        cache.set(_CATALOG_CACHE_KEY, catalog, _CATALOG_TTL_SECONDS)
        return catalog

    # ---------- search ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        q = (query or "").strip().lower()
        if not q:
            return []
        catalog = self._fetch_catalog()
        out: list[MangaDTO] = []
        for t in catalog:
            name = (t.get("name") or "").lower()
            author = (t.get("author") or "").lower()
            if q in name or q in author:
                out.append(self._to_manga_dto(t))
                if len(out) >= 20:
                    break
        return out

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(
                "/title_detailV3",
                endpoint="manga",
                params={"title_id": external_id, "format": "json"},
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        view = payload.get("success", {}).get("titleDetailView", {})
        title = view.get("title") or {}
        lang = self._lang_code((title.get("language") or "").lower())
        return MangaDTO(
            external_id=external_id,
            title=title.get("name") or external_id,
            url=urljoin(self.SITE_URL + "/", f"titles/{external_id}"),
            cover_url=title.get("portraitImageUrl") or title.get("landscapeImageUrl") or "",
            description=view.get("overview") or "",
            languages=[lang] if lang else [],
        )

    # ---------- chapters ----------

    def fetch_chapters(
        self, external_id: str, language: Optional[str] = None
    ) -> list[ChapterDTO]:
        try:
            resp = self.client.get(
                "/title_detailV3",
                endpoint="chapters",
                params={"title_id": external_id, "format": "json"},
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        view = payload.get("success", {}).get("titleDetailView", {})
        title = view.get("title") or {}
        lang = self._lang_code((title.get("language") or "").lower())
        # Capitulos vivem em chapterListGroup/firstChapterList/lastChapterList
        # dependendo da versao da resposta. Coletamos tudo e dedupamos.
        flat: list[dict] = []
        for key in ("firstChapterList", "lastChapterList", "chapterListGroup"):
            v = view.get(key)
            if isinstance(v, list):
                for entry in v:
                    if isinstance(entry, dict) and (
                        "midListChapters" in entry
                        or "firstChapterList" in entry
                        or "lastChapterList" in entry
                    ):
                        flat.extend(entry.get("firstChapterList") or [])
                        flat.extend(entry.get("midListChapters") or [])
                        flat.extend(entry.get("lastChapterList") or [])
                    elif isinstance(entry, dict):
                        flat.append(entry)
        seen: set[int] = set()
        out: list[ChapterDTO] = []
        for ch in flat:
            cid = ch.get("chapterId")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            sub = (ch.get("subTitle") or "").lstrip("#").strip()
            try:
                num = float(sub.split()[0]) if sub else 0.0
            except (TypeError, ValueError, IndexError):
                num = 0.0
            out.append(
                ChapterDTO(
                    external_id=str(cid),
                    number=num,
                    title=ch.get("name") or sub,
                    language=lang,
                    url=urljoin(self.SITE_URL + "/", f"viewer/{cid}"),
                )
            )
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            resp = self.client.get(
                "/manga_viewer",
                endpoint="pages",
                params={
                    "chapter_id": chapter_external_id,
                    "split": "yes",
                    "img_quality": "high",
                    "format": "json",
                },
            )
            payload = resp.json()
        except (SourceHTTPError, ValueError):
            return []
        view = payload.get("success", {}).get("mangaViewer", {})
        pages_raw = view.get("pages") or []
        out: list[PageDTO] = []
        for i, p in enumerate(pages_raw):
            mp = p.get("mangaPage") or p
            url = mp.get("imageUrl")
            if not url:
                continue
            out.append(
                PageDTO(
                    index=i,
                    url=url,
                    headers={"Referer": self.SITE_URL + "/"},
                )
            )
        return out

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/title_list/allV2",
                endpoint="healthcheck",
                params={"format": "json"},
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
            payload = {}
        groups = (
            payload.get("success", {})
            .get("allTitlesViewV2", {})
            .get("AllTitlesGroup", [])
        )
        count = sum(len(g.get("titles") or []) for g in groups)
        return HealthResult(
            success=resp.status_code < 400 and count > 0,
            latency_ms=latency,
            status_code=resp.status_code,
            extracted_count=count,
        )

    # ---------- DTO mapping ----------

    def _to_manga_dto(self, t: dict) -> MangaDTO:
        tid = t.get("titleId")
        lang = self._lang_code((t.get("language") or "").lower())
        return MangaDTO(
            external_id=str(tid),
            title=t.get("name") or "",
            url=urljoin(self.SITE_URL + "/", f"titles/{tid}"),
            cover_url=t.get("portraitImageUrl") or t.get("landscapeImageUrl") or "",
            description="",
            languages=[lang] if lang else [],
        )

    @staticmethod
    def _lang_code(raw: str) -> str:
        """MangaPlus envia codigos curtos (eng, esp, ptb...) ou cheios."""
        m = {
            "eng": "en", "english": "en", "0": "en",
            "esp": "es-la", "spanish": "es-la", "1": "es-la",
            "ptb": "pt-br", "portuguese": "pt-br", "5": "pt-br",
            "fra": "fr", "french": "fr", "2": "fr",
            "ind": "id", "indonesian": "id", "3": "id",
            "vie": "vi", "vietnamese": "vi", "8": "vi",
            "tha": "th", "thai": "th", "7": "th",
            "rus": "ru", "russian": "ru", "4": "ru",
        }
        return m.get(raw, raw or "en")
