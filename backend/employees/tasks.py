"""Celery tasks for MangaDex sync work.

These are the only places that should kick off blocking calls to MangaDex.
The rate limiter inside ``MangaDexClient`` keeps every worker honest; here we
take care of orchestration (dedupe locks, retries on transient errors).
"""

from __future__ import annotations

import logging

import redis
from celery import shared_task
from django.conf import settings
from requests.exceptions import HTTPError, RequestException

from .mangadex_client import RateLimitExceeded
from .models import Manga
from .services import MangaDexScanner

logger = logging.getLogger(__name__)


def _redis_for_locks() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


@shared_task(
    bind=True,
    name="employees.import_manga_chapters",
    autoretry_for=(),  # We handle retries explicitly so we can read Retry-After.
    max_retries=4,
)
def task_import_manga_chapters(self, mangadex_id: str):
    """Import metadata + chapter list for a single mangá."""
    logger.info(
        "[import_manga] %s tentativa=%d", mangadex_id, self.request.retries + 1
    )

    scanner = MangaDexScanner()

    try:
        manga = scanner.import_manga_by_id(mangadex_id)
    except RateLimitExceeded as exc:
        logger.warning("Rate limit no import de %s: %s", mangadex_id, exc)
        raise self.retry(exc=exc, countdown=30)
    except HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 429:
            raise self.retry(exc=exc, countdown=60)
        if exc.response is not None and 500 <= exc.response.status_code < 600:
            raise self.retry(exc=exc, countdown=30)
        logger.error("HTTP erro fatal no import de %s: %s", mangadex_id, exc)
        return {"status": "error", "reason": str(exc)}
    except RequestException as exc:
        raise self.retry(exc=exc, countdown=60)
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("Erro não-recuperável no import de %s", mangadex_id)
        return {"status": "error", "reason": str(exc)}

    if not manga:
        logger.warning("import_manga_by_id retornou None para %s", mangadex_id)
        return {"status": "not_found", "mangadex_id": mangadex_id}

    try:
        synced = scanner.sync_chapters_for_manga(manga)
    except RateLimitExceeded as exc:
        logger.warning("Rate limit nos capítulos de %s: %s", manga.title, exc)
        raise self.retry(exc=exc, countdown=30)
    except RequestException as exc:
        raise self.retry(exc=exc, countdown=60)
    except Exception as exc:  # pragma: no cover
        logger.exception("Erro nos capítulos de %s", manga.title)
        return {"status": "partial", "manga_id": manga.id, "reason": str(exc)}

    return {"status": "ok", "manga_id": manga.id, "chapters_synced": synced}


@shared_task(
    bind=True,
    name="employees.seed_initial_library",
    max_retries=3,
)
def task_seed_initial_library(self):
    """Populate an empty library with popular mangás.

    Uses a Redis lock so that concurrent requests to the home don't kick off
    multiple seed runs.
    """
    redis_client = _redis_for_locks()
    lock_key = "lock:seed_initial_library"
    # Acquire (NX) with a 10-min TTL — the seed never takes that long.
    acquired = redis_client.set(lock_key, "1", nx=True, ex=600)
    if not acquired:
        logger.info("Seed em andamento; abortando run duplicado")
        return {"status": "skipped"}

    try:
        if Manga.objects.filter(is_active=True).count() >= 5:
            logger.info("Biblioteca já populada; nada a fazer")
            return {"status": "noop"}

        scanner = MangaDexScanner()
        ok = scanner.sync_popular_mangas()
        return {"status": "ok" if ok else "failed"}
    except RateLimitExceeded as exc:
        logger.warning("Seed atingiu rate limit: %s", exc)
        raise self.retry(exc=exc, countdown=120)
    except RequestException as exc:
        raise self.retry(exc=exc, countdown=120)
    finally:
        redis_client.delete(lock_key)


# ---------------------------------------------------------------------------
# Scheduled tasks (Celery Beat)
# ---------------------------------------------------------------------------
@shared_task(name="employees.scheduled_refresh_popular")
def task_refresh_popular():
    """Hourly: refresh metadata for popular mangás on MangaDex."""
    redis_client = _redis_for_locks()
    lock_key = "lock:scheduled_refresh_popular"
    if not redis_client.set(lock_key, "1", nx=True, ex=3600):
        logger.info("refresh_popular já em execução; ignorando run")
        return {"status": "skipped"}
    try:
        scanner = MangaDexScanner()
        ok = scanner.sync_popular_mangas()
        return {"status": "ok" if ok else "failed"}
    finally:
        redis_client.delete(lock_key)


@shared_task(name="employees.scheduled_sync_followed_feeds")
def task_sync_followed_feeds():
    """Every 6h: refresh chapter feed for mangás that users care about.

    Priority: mangás that have favorites or recent reading progress. Falls back
    to "every active manga" only when nothing is followed yet.
    """
    redis_client = _redis_for_locks()
    lock_key = "lock:scheduled_sync_followed_feeds"
    if not redis_client.set(lock_key, "1", nx=True, ex=21600):
        logger.info("sync_followed_feeds já em execução; ignorando run")
        return {"status": "skipped"}
    try:
        followed_ids = set(
            Manga.objects.filter(favorited_by__isnull=False, is_active=True)
            .values_list("id", flat=True)
            .distinct()
        )
        # Try to also include recently-read mangás without requiring an import.
        try:
            from accounts.models import ReadingProgress  # local import to avoid cycle
            recent = (
                ReadingProgress.objects.values_list("chapter__manga_id", flat=True)
                .distinct()
            )
            followed_ids.update(recent)
        except Exception:  # pragma: no cover — accounts app must be installed
            logger.exception("Falha ao incluir mangás com progresso recente")

        if not followed_ids:
            logger.info("Nenhum mangá seguido — pulando sync_followed_feeds")
            return {"status": "noop"}

        scanner = MangaDexScanner()
        synced = 0
        for manga_id in followed_ids:
            manga = Manga.objects.filter(id=manga_id, is_active=True).first()
            if not manga or not manga.mangadex_id:
                continue
            try:
                scanner.sync_chapters_for_manga(manga)
                synced += 1
            except RateLimitExceeded:
                logger.warning("Rate limit atingido em sync_followed_feeds; abortando run")
                break
            except RequestException as exc:
                logger.warning("Falha em %s: %s", manga.title, exc)
                continue
        return {"status": "ok", "synced": synced, "considered": len(followed_ids)}
    finally:
        redis_client.delete(lock_key)


@shared_task(name="employees.scheduled_cleanup_orphans")
def task_cleanup_orphans():
    """Daily: deactivate mangás that have no chapters and weren't favorited.

    Conservative: never deletes — only flips ``is_active`` to False so that the
    catalogue queries hide them. Admins can revert via Django admin.
    """
    candidates = (
        Manga.objects.filter(is_active=True, chapters__isnull=True, favorited_by__isnull=True)
        .distinct()
    )
    count = candidates.count()
    if count:
        candidates.update(is_active=False)
        logger.info("cleanup_orphans desativou %d mangás", count)
    return {"status": "ok", "deactivated": count}
