"""Domain services that orchestrate MangaDex syncs.

All HTTP interactions go through ``MangaDexClient`` so that rate limits, retries,
caching and the User-Agent policy are enforced centrally. These functions stay
focused on translating MangaDex payloads into our local models.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable, Optional

from django.core.cache import cache

from .mangadex_client import MangaDexClient, get_client
from .models import Category, Chapter, Manga

# Search results stay fresh enough for 5min — most users searching the same
# title within 5min get the cached payload, so MangaDex's quota gets used once.
SEARCH_CACHE_TTL = 300
SEARCH_CACHE_PREFIX = "mangadex:search:"

_WS_RE = re.compile(r"\s+")

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Reader helper (used by the chapter pages endpoint)
# ----------------------------------------------------------------------
def get_mangadex_pages(
    mangadex_chapter_id: str, *, force_refresh: bool = False
) -> list[dict[str, Any]]:
    """Return the list of page URLs for a given MangaDex chapter id.

    Uses the client's cache so repeated reads of the same chapter don't re-hit
    the rate-limited ``/at-home/server`` endpoint. The MangaDex ``baseUrl``
    token is only valid for ~15 minutes — pass ``force_refresh=True`` (e.g.
    when the reader gets a 404 on a page) to skip the cache and reissue.
    """
    try:
        data = get_client().get_at_home_server(
            mangadex_chapter_id, force_refresh=force_refresh
        )
    except Exception as exc:
        logger.exception("Falha ao obter páginas do MangaDex para %s: %s", mangadex_chapter_id, exc)
        return []

    base_url = data.get("baseUrl")
    chapter = data.get("chapter") or {}
    chapter_hash = chapter.get("hash")
    filenames = chapter.get("data") or []

    if not (base_url and chapter_hash and filenames):
        logger.warning("Resposta /at-home/server inválida para %s", mangadex_chapter_id)
        return []

    return [
        {
            "id": index,
            "image": f"{base_url}/data/{chapter_hash}/{filename}",
            "order": index,
        }
        for index, filename in enumerate(filenames)
    ]


# ----------------------------------------------------------------------
# Scanner
# ----------------------------------------------------------------------
class MangaDexScanner:
    """Higher-level operations that read from MangaDex and persist locally."""

    DEFAULT_LANGUAGES = ("pt-br", "en")
    DEFAULT_CONTENT_RATING = ("safe", "suggestive", "erotica", "pornographic")

    def __init__(self, client: Optional[MangaDexClient] = None):
        self.client = client or get_client()

    # --------------------------------------------------------------
    # Search (used by the omni-search endpoint)
    # --------------------------------------------------------------
    def search_manga(self, query: str, *, limit: int = 12) -> list[dict[str, Any]]:
        # Normalize for cache hits: trim/lowercase/collapse whitespace.
        normalized = _WS_RE.sub(" ", query.strip().lower())
        cache_key = f"{SEARCH_CACHE_PREFIX}{limit}:{normalized}"
        cached = cache.get(cache_key)
        if cached is not None:
            logger.debug("MangaDex search cache HIT: %r", normalized)
            return cached

        params = {
            "title": query,
            "limit": limit,
            "includes[]": "cover_art",
            "availableTranslatedLanguage[]": list(self.DEFAULT_LANGUAGES),
            "order[followedCount]": "desc",
        }
        try:
            payload = self.client.list_manga(**params)
        except Exception as exc:
            logger.warning("Busca MangaDex falhou para '%s': %s", query, exc)
            return []

        results: list[dict[str, Any]] = [
            self._summarize(m) for m in payload.get("data", [])
        ]
        cache.set(cache_key, results, SEARCH_CACHE_TTL)
        return results

    # --------------------------------------------------------------
    # Bulk sync helpers
    # --------------------------------------------------------------
    def sync_popular_mangas(self) -> bool:
        params = self._base_list_params()
        params["order[followedCount]"] = "desc"
        logger.info("Iniciando sincronização de mangás populares")
        return self._process_batch(params)

    def sync_latest_updates(self) -> bool:
        params = self._base_list_params()
        params["order[latestUploadedChapter]"] = "desc"
        logger.info("Iniciando sincronização de últimas atualizações")
        return self._process_batch(params)

    def import_manga_by_id(self, mangadex_id: str) -> Optional[Manga]:
        params = {
            "ids[]": [mangadex_id],
            "includes[]": "cover_art",
            "contentRating[]": list(self.DEFAULT_CONTENT_RATING),
            "limit": 1,
        }
        if not self._process_batch(params):
            return None
        return Manga.objects.filter(mangadex_id=mangadex_id).first()

    def sync_chapters_for_manga(self, manga_obj: Manga) -> int:
        if not manga_obj.mangadex_id:
            logger.info("Pulando %s (sem mangadex_id)", manga_obj.title)
            return 0

        logger.info("Sincronizando capítulos para: %s", manga_obj.title)
        offset = 0
        limit = 500
        total_synced = 0

        while True:
            params = {
                "translatedLanguage[]": list(self.DEFAULT_LANGUAGES),
                "order[chapter]": "desc",
                "contentRating[]": list(self.DEFAULT_CONTENT_RATING),
                "limit": limit,
                "offset": offset,
            }
            try:
                payload = self.client.get_manga_feed(manga_obj.mangadex_id, **params)
            except Exception as exc:
                logger.warning("Falha no feed de %s: %s", manga_obj.title, exc)
                break

            chapters = payload.get("data", [])
            if not chapters:
                break

            for ch_data in chapters:
                attrs = ch_data.get("attributes") or {}
                dex_id = ch_data.get("id")
                if not dex_id:
                    continue
                chap_num = attrs.get("chapter") or 0
                try:
                    chap_num_decimal = float(chap_num)
                except (TypeError, ValueError):
                    chap_num_decimal = 0
                Chapter.objects.update_or_create(
                    mangadex_id=dex_id,
                    defaults={
                        "manga": manga_obj,
                        "number": chap_num_decimal,
                        "title": attrs.get("title") or "",
                    },
                )
                total_synced += 1

            total_remote = payload.get("total") or 0
            if total_synced >= total_remote:
                break
            offset += limit
            if offset >= 10000:
                logger.info("Limite de segurança de offset atingido para %s", manga_obj.title)
                break

        logger.info("Sincronizados %d capítulos para %s", total_synced, manga_obj.title)
        return total_synced

    # --------------------------------------------------------------
    # Internals
    # --------------------------------------------------------------
    def _base_list_params(self) -> dict[str, Any]:
        return {
            "limit": 20,
            "includes[]": "cover_art",
            "availableTranslatedLanguage[]": list(self.DEFAULT_LANGUAGES),
            "contentRating[]": list(self.DEFAULT_CONTENT_RATING),
            "hasAvailableChapters": "true",
        }

    def _process_batch(self, params: dict[str, Any]) -> bool:
        try:
            payload = self.client.list_manga(**params)
        except Exception as exc:
            logger.exception("Falha em list_manga: %s", exc)
            return False

        for manga_data in payload.get("data", []):
            manga_obj, created = self._upsert_manga(manga_data)
            if created:
                # New manga: pull its chapter feed in the same task context.
                self.sync_chapters_for_manga(manga_obj)

        return True

    def _summarize(self, manga_data: dict[str, Any]) -> dict[str, Any]:
        dex_id = manga_data.get("id")
        attrs = manga_data.get("attributes") or {}
        return {
            "mangadex_id": dex_id,
            "title": _pick_title(attrs.get("title") or {}),
            "description": _pick_localized(attrs.get("description") or {}),
            "cover": _build_cover_url(dex_id, manga_data.get("relationships") or []),
            "author": "Desconhecido",
            "status": (attrs.get("status") or "unknown").upper(),
            "content_rating": (attrs.get("contentRating") or "safe").lower(),
        }

    def _upsert_manga(self, manga_data: dict[str, Any]) -> tuple[Manga, bool]:
        summary = self._summarize(manga_data)
        attrs = manga_data.get("attributes") or {}

        rating = summary.get("content_rating") or "safe"
        if rating not in {"safe", "suggestive", "erotica", "pornographic"}:
            rating = "safe"

        manga_obj, created = Manga.objects.update_or_create(
            mangadex_id=summary["mangadex_id"],
            defaults={
                "title": summary["title"],
                "description": summary["description"],
                "cover": summary["cover"],
                "status": summary["status"],
                "content_rating": rating,
            },
        )

        tags = attrs.get("tags") or []
        if tags:
            self._apply_tags(manga_obj, tags)

        return manga_obj, created

    @staticmethod
    def _apply_tags(manga_obj: Manga, tags: Iterable[dict[str, Any]]) -> None:
        for tag in tags:
            tag_attrs = (tag or {}).get("attributes") or {}
            name_dict = tag_attrs.get("name") or {}
            tag_name = name_dict.get("en") or next(iter(name_dict.values()), None)
            if not tag_name:
                continue
            slug = tag_name.lower().replace(" ", "-")
            category, _ = Category.objects.get_or_create(
                slug=slug,
                defaults={"name": tag_name},
            )
            manga_obj.categories.add(category)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _pick_title(title_dict: dict[str, str]) -> str:
    if not title_dict:
        return "(sem título)"
    return (
        title_dict.get("en")
        or title_dict.get("pt-br")
        or title_dict.get("ja-ro")
        or next(iter(title_dict.values()), "(sem título)")
    )


def _pick_localized(values: dict[str, str]) -> str:
    if not values:
        return ""
    return values.get("pt-br") or values.get("en") or next(iter(values.values()), "")


def _build_cover_url(dex_id: Optional[str], relationships: list[dict[str, Any]]) -> str:
    if not dex_id:
        return ""
    for rel in relationships:
        if rel.get("type") == "cover_art":
            attrs = rel.get("attributes") or {}
            filename = attrs.get("fileName")
            if filename:
                return f"https://uploads.mangadex.org/covers/{dex_id}/{filename}.256.jpg"
    return ""
