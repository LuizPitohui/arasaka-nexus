"""MangaDex como `BaseSource` — adaptador sobre `employees.mangadex_client`.

Estratégia: NÃO duplicar código. O `MangaDexClient` existente já implementa
rate limiter Redis, retry com backoff, cache de `/at-home/server` e respeito
ao `Retry-After`. Esse provider só traduz payloads para os DTOs canônicos.

Telemetria: como o cliente do MangaDex tem caminho próprio (não passa pelo
`BaseHTTPClient`), os healthchecks ativos gravam SourceHealthLog manualmente
em `healthcheck()`. Tráfego real não é instrumentado por enquanto — fica
como TODO quando refatorarmos o `mangadex_client` pra emitir eventos.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from employees.mangadex_client import MangaDexClient, RateLimitExceeded, get_client

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


class MangaDexSource(BaseSource):
    id = "mangadex"
    name = "MangaDex"
    base_url = "https://api.mangadex.org"
    languages = ["pt-br", "en", "es-la", "ja-ro"]
    kind = "api"

    DEFAULT_CONTENT_RATING = ("safe", "suggestive", "erotica", "pornographic")

    def __init__(self, client: Optional[MangaDexClient] = None):
        self.client = client or get_client()

    # ---------- search & detail ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        limit = 20
        offset = (page - 1) * limit
        params = {
            "title": query,
            "limit": limit,
            "offset": offset,
            "includes[]": "cover_art",
            "availableTranslatedLanguage[]": ["pt-br", "en"],
            "order[followedCount]": "desc",
        }
        try:
            payload = self.client.list_manga(**params)
        except Exception as exc:
            logger.warning("MangaDex search falhou para %r: %s", query, exc)
            return []
        return [self._to_manga_dto(m) for m in payload.get("data", [])]

    def fetch_manga(self, external_id: str) -> MangaDTO:
        params = {
            "ids[]": [external_id],
            "includes[]": "cover_art",
            "contentRating[]": list(self.DEFAULT_CONTENT_RATING),
            "limit": 1,
        }
        payload = self.client.list_manga(**params)
        items = payload.get("data") or []
        if not items:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        return self._to_manga_dto(items[0])

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        out: list[ChapterDTO] = []
        offset = 0
        limit = 500
        languages = [language] if language else ["pt-br", "en"]
        while True:
            params = {
                "translatedLanguage[]": languages,
                "order[chapter]": "desc",
                "contentRating[]": list(self.DEFAULT_CONTENT_RATING),
                "limit": limit,
                "offset": offset,
            }
            try:
                payload = self.client.get_manga_feed(external_id, **params)
            except Exception as exc:
                logger.warning("MangaDex feed falhou para %s: %s", external_id, exc)
                break
            chapters = payload.get("data") or []
            for ch in chapters:
                dto = self._to_chapter_dto(ch)
                if dto:
                    out.append(dto)
            total_remote = payload.get("total") or 0
            if len(out) >= total_remote or not chapters:
                break
            offset += limit
            if offset >= 10000:
                break
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            data = self.client.get_at_home_server(chapter_external_id)
        except Exception as exc:
            logger.warning("MangaDex /at-home falhou para %s: %s", chapter_external_id, exc)
            return []

        base = data.get("baseUrl")
        chapter = data.get("chapter") or {}
        chapter_hash = chapter.get("hash")
        filenames = chapter.get("data") or []
        if not (base and chapter_hash and filenames):
            return []
        return [
            PageDTO(
                index=i,
                url=f"{base}/data/{chapter_hash}/{fn}",
            )
            for i, fn in enumerate(filenames)
        ]

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        """Probe leve: lista 1 mangá. Endpoint público, raramente lento."""
        t0 = time.monotonic()
        try:
            payload = self.client.list_manga(limit=1)
        except RateLimitExceeded as exc:
            return HealthResult(
                success=False,
                latency_ms=int((time.monotonic() - t0) * 1000),
                error_class="RateLimitExceeded",
                error_message=str(exc)[:500],
                extracted_count=0,
            )
        except Exception as exc:
            return HealthResult(
                success=False,
                latency_ms=int((time.monotonic() - t0) * 1000),
                error_class=exc.__class__.__name__,
                error_message=str(exc)[:500],
                extracted_count=0,
            )
        latency = int((time.monotonic() - t0) * 1000)
        items = payload.get("data") or []
        return HealthResult(
            success=True,
            latency_ms=latency,
            status_code=200,
            extracted_count=len(items),
        )

    # ---------- DTO mapping ----------

    def _to_manga_dto(self, m: dict) -> MangaDTO:
        dex_id = m.get("id", "")
        attrs = m.get("attributes") or {}
        rels = m.get("relationships") or []
        title = _pick_title(attrs.get("title") or {})
        desc = _pick_localized(attrs.get("description") or {})
        cover = _build_cover_url(dex_id, rels)
        status = (attrs.get("status") or "").lower()
        rating = (attrs.get("contentRating") or "safe").lower()
        if rating not in {"safe", "suggestive", "erotica", "pornographic"}:
            rating = "safe"
        langs = list(attrs.get("availableTranslatedLanguages") or [])
        return MangaDTO(
            external_id=dex_id,
            title=title,
            url=f"https://mangadex.org/title/{dex_id}",
            cover_url=cover,
            description=desc,
            status=status if status in {"ongoing", "completed", "hiatus"} else "",
            languages=langs,
            content_rating=rating,
        )

    def _to_chapter_dto(self, ch: dict) -> Optional[ChapterDTO]:
        dex_id = ch.get("id")
        if not dex_id:
            return None
        attrs = ch.get("attributes") or {}
        try:
            number = float(attrs.get("chapter") or 0)
        except (TypeError, ValueError):
            number = 0.0
        scanlator = ""
        for rel in ch.get("relationships") or []:
            if rel.get("type") == "scanlation_group":
                scanlator = ((rel.get("attributes") or {}).get("name")) or ""
                break
        return ChapterDTO(
            external_id=dex_id,
            number=number,
            title=attrs.get("title") or "",
            language=(attrs.get("translatedLanguage") or "").lower(),
            scanlator=scanlator,
            url=f"https://mangadex.org/chapter/{dex_id}",
        )


# ---------- helpers (independentes da classe pra facilitar teste) ----------

def _pick_title(d: dict) -> str:
    if not d:
        return "(sem título)"
    return d.get("en") or d.get("pt-br") or d.get("ja-ro") or next(iter(d.values()), "(sem título)")


def _pick_localized(d: dict) -> str:
    if not d:
        return ""
    return d.get("pt-br") or d.get("en") or next(iter(d.values()), "")


def _build_cover_url(dex_id: str, rels: list[dict]) -> str:
    if not dex_id:
        return ""
    for rel in rels:
        if rel.get("type") == "cover_art":
            attrs = rel.get("attributes") or {}
            fn = attrs.get("fileName")
            if fn:
                return f"https://uploads.mangadex.org/covers/{dex_id}/{fn}.256.jpg"
    return ""
