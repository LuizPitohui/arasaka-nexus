"""Celery tasks for MangaDex sync work.

These are the only places that should kick off blocking calls to MangaDex.
The rate limiter inside ``MangaDexClient`` keeps every worker honest; here we
take care of orchestration (dedupe locks, retries on transient errors).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import redis
import requests
from celery import shared_task
from django.conf import settings
from requests.exceptions import HTTPError, RequestException

from .mangadex_client import RateLimitExceeded, get_client
from .models import Chapter, ChapterImage, Manga
from .services import MangaDexScanner, get_mangadex_pages

logger = logging.getLogger(__name__)


def _redis_for_locks() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _persist_mihon_manga(manga_dto, *, fetch_chapters_for: str | None = None) -> tuple["Manga", bool, int]:
    """Cria/atualiza Manga + Chapters a partir de um MangaDTO Mihon.

    Retorna (manga, created, chapters_synced). Quando ``fetch_chapters_for`` é
    passado (formato "<inner>:<mid>"), tambem busca capitulos via SuwayomiSource
    e atualiza/cria as rows de Chapter; caso contrario so persiste metadados.

    Helper compartilhado entre task_import_mihon_manga (1 obra),
    task_mihon_pull_latest (top de cada extensao) e o command mihon_backfill.
    """
    storage_id = f"mihon:{manga_dto.external_id}"

    status_map = {"ongoing": "ONGOING", "completed": "COMPLETED", "hiatus": "HIATUS"}
    chapter_status = status_map.get((manga_dto.status or "").lower(), "ONGOING")

    rating_choices = {"safe", "suggestive", "erotica", "pornographic"}
    cr = (manga_dto.content_rating or "safe").lower()
    if cr not in rating_choices:
        cr = "safe"

    manga, created = Manga.objects.update_or_create(
        mangadex_id=storage_id,
        defaults={
            "source_id": "mihon",
            "title": manga_dto.title,
            "alternative_title": "",
            "description": manga_dto.description or "",
            "cover": manga_dto.cover_url or "",
            "author": manga_dto.author or "Desconhecido",
            "status": chapter_status,
            "content_rating": cr,
            "is_active": True,
        },
    )

    chapters_synced = 0
    if fetch_chapters_for:
        from sources import registry as sources_registry

        src = sources_registry.get("mihon")
        if src is None or not getattr(src, "is_configured", False):
            return manga, created, 0
        try:
            chapters_dto = src.fetch_chapters(fetch_chapters_for)
        except Exception:
            logger.exception("persist_mihon: fetch_chapters falhou para %s", fetch_chapters_for)
            return manga, created, 0
        for cd in chapters_dto:
            chapter_storage_id = f"mihon:{cd.external_id}"
            try:
                chap_num = float(cd.number or 0)
            except (TypeError, ValueError):
                chap_num = 0.0
            Chapter.objects.update_or_create(
                mangadex_id=chapter_storage_id,
                defaults={
                    "manga": manga,
                    "source_id": "mihon",
                    "number": chap_num,
                    "title": cd.title or "",
                    "translated_language": (cd.language or "").lower(),
                },
            )
            chapters_synced += 1
    return manga, created, chapters_synced


@shared_task(
    bind=True,
    name="employees.import_mihon_manga",
    max_retries=2,
)
def task_import_mihon_manga(self, external_id: str) -> dict:
    """Importa metadados + lista de capitulos de uma obra Mihon (via Suwayomi).

    `external_id` no formato "<inner_source_id>:<suwayomi_manga_id>". Persiste
    como Manga(source_id="mihon", mangadex_id=f"mihon:{external_id}") para nao
    colidir com UUIDs do MangaDex e permitir lookups rapidos.
    """
    from sources import registry as sources_registry

    src = sources_registry.get("mihon")
    if src is None or not getattr(src, "is_configured", False):
        return {"status": "error", "reason": "mihon-not-configured"}

    try:
        manga_dto = src.fetch_manga(external_id)
    except Exception as exc:
        logger.exception("import_mihon_manga: fetch_manga falhou para %s", external_id)
        return {"status": "error", "reason": str(exc)[:200]}

    if not manga_dto or not manga_dto.title or manga_dto.title == "(não encontrado)":
        return {"status": "not_found", "external_id": external_id}

    manga, created, synced = _persist_mihon_manga(manga_dto, fetch_chapters_for=external_id)

    return {
        "status": "ok",
        "manga_id": manga.id,
        "chapters_synced": synced,
        "created": created,
    }


@shared_task(name="employees.scheduled_pull_mihon_latest")
def task_mihon_pull_latest(per_source_pages: int = 1, max_per_source: int = 25) -> dict:
    """Cron noturno: top `latest` de cada extensao Mihon.

    Para cada source instalado no Suwayomi:
      - Pagina /latest (ate `per_source_pages` paginas)
      - Pra cada hit:
          * Se ja temos o Manga local -> dispara fetch_chapters (atualiza
            capitulos novos)
          * Se e novo -> cria Manga + lista de capitulos

    Cap `max_per_source` evita explodir o DB se uma extensao ficar maluca.
    Skipa silenciosamente se Suwayomi nao estiver configurado.
    """
    from sources import registry as sources_registry

    src = sources_registry.get("mihon")
    if src is None or not getattr(src, "is_configured", False):
        return {"status": "skipped", "reason": "mihon-not-configured"}

    try:
        sources = src._list_sources()
    except Exception:
        sources = []
    if not sources:
        return {"status": "skipped", "reason": "no-sources"}

    summary = {"sources_visited": 0, "new_mangas": 0, "updated_mangas": 0, "chapters_synced": 0}
    for s in sources:
        inner_id = str(s.get("id") or "")
        if not inner_id or inner_id == "0":  # local source
            continue
        items_seen = 0
        page = 1
        while page <= per_source_pages and items_seen < max_per_source:
            try:
                dtos, has_next = src.browse(inner_id, kind="latest", page=page)
            except Exception as exc:
                logger.warning("mihon pull_latest browse falhou em %s p=%d: %s", inner_id, page, exc)
                break
            if not dtos:
                break
            for dto in dtos:
                if items_seen >= max_per_source:
                    break
                items_seen += 1
                # update_or_create: cria se nao existe, atualiza se existe.
                # Capitulos so sao re-fetched pra cada hit (sao 25 max/extensao
                # x N extensoes; ~125 fetch_chapters/noite, gerenciavel).
                try:
                    manga, created, chs = _persist_mihon_manga(
                        dto, fetch_chapters_for=dto.external_id
                    )
                except Exception:
                    logger.exception("mihon pull_latest: persist falhou %s", dto.external_id)
                    continue
                if created:
                    summary["new_mangas"] += 1
                else:
                    summary["updated_mangas"] += 1
                summary["chapters_synced"] += chs
            if not has_next:
                break
            page += 1
        summary["sources_visited"] += 1

    return {"status": "ok", **summary}


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

    Priority: mangás que tem favoritos ou progress recente. Roteia por
    source_id:
      - mangadex: usa MangaDexScanner.sync_chapters_for_manga
      - mihon:    re-puxa do Suwayomi via SuwayomiSource.fetch_chapters
                  e faz update_or_create dos Chapter rows
      - outros:   ignora (nao implementado)
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
        try:
            from accounts.models import ReadingProgress
            recent = (
                ReadingProgress.objects.values_list("chapter__manga_id", flat=True)
                .distinct()
            )
            followed_ids.update(recent)
        except Exception:  # pragma: no cover
            logger.exception("Falha ao incluir mangás com progresso recente")

        if not followed_ids:
            logger.info("Nenhum mangá seguido — pulando sync_followed_feeds")
            return {"status": "noop"}

        scanner = MangaDexScanner()  # lazy: só usado se houver mangadex follows
        synced_mangadex = 0
        synced_mihon = 0
        skipped = 0

        for manga_id in followed_ids:
            manga = Manga.objects.filter(id=manga_id, is_active=True).first()
            if not manga or not manga.mangadex_id:
                continue

            if manga.source_id == "mangadex":
                try:
                    scanner.sync_chapters_for_manga(manga)
                    synced_mangadex += 1
                except RateLimitExceeded:
                    logger.warning("Rate limit em sync_followed_feeds (mangadex); abortando")
                    break
                except RequestException as exc:
                    logger.warning("Falha mangadex em %s: %s", manga.title, exc)
                    continue
            elif manga.source_id == "mihon":
                # Re-puxa lista de capitulos via Suwayomi e atualiza local.
                # Storage_id = "mihon:<inner>:<mid>"; o external_id pra
                # SuwayomiSource e o sufixo apos "mihon:".
                from sources import registry as sources_registry

                src = sources_registry.get("mihon")
                if not src or not getattr(src, "is_configured", False):
                    skipped += 1
                    continue
                external_id = manga.mangadex_id
                if external_id.startswith("mihon:"):
                    external_id = external_id[len("mihon:"):]
                try:
                    chapters_dto = src.fetch_chapters(external_id)
                except Exception as exc:
                    logger.warning("Falha mihon em %s: %s", manga.title, exc)
                    continue
                from .models import Chapter as _Chapter
                for cd in chapters_dto:
                    chapter_storage_id = f"mihon:{cd.external_id}"
                    try:
                        chap_num = float(cd.number or 0)
                    except (TypeError, ValueError):
                        chap_num = 0.0
                    _Chapter.objects.update_or_create(
                        mangadex_id=chapter_storage_id,
                        defaults={
                            "manga": manga,
                            "source_id": "mihon",
                            "number": chap_num,
                            "title": cd.title or "",
                            "translated_language": (cd.language or "").lower(),
                        },
                    )
                synced_mihon += 1
            else:
                skipped += 1

        return {
            "status": "ok",
            "synced_mangadex": synced_mangadex,
            "synced_mihon": synced_mihon,
            "skipped": skipped,
            "considered": len(followed_ids),
        }
    finally:
        redis_client.delete(lock_key)


# ---------------------------------------------------------------------------
# Cover mirror — download each manga's cover into MEDIA so the frontend stops
# hitting uploads.mangadex.org (which has its own rate limit) and we keep the
# image even if the upstream removes it.
# ---------------------------------------------------------------------------
COVER_DIR = "covers"
COVER_USER_AGENT_HEADER = {"User-Agent": settings.MANGADEX_USER_AGENT}


def _download_image(url: str, dest: Path, timeout: int = 20) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, headers=COVER_USER_AGENT_HEADER, timeout=timeout, stream=True)
    response.raise_for_status()
    size = 0
    with open(dest, "wb") as fh:
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            fh.write(chunk)
            size += len(chunk)
    return size


@shared_task(name="employees.download_cover", bind=True, max_retries=2)
def task_download_cover(self, manga_id: int):
    manga = Manga.objects.filter(id=manga_id).first()
    if not manga or not manga.cover or manga.cover_path:
        return {"status": "skipped", "manga_id": manga_id}

    url = manga.cover
    ext = os.path.splitext(url.split("?", 1)[0])[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    rel_path = f"{COVER_DIR}/{manga_id:06d}{ext}"
    dest = Path(settings.MEDIA_ROOT) / rel_path

    try:
        _download_image(url, dest)
    except RequestException as exc:
        logger.warning("Falha download cover %s: %s", manga_id, exc)
        raise self.retry(exc=exc, countdown=60)

    Manga.objects.filter(id=manga_id).update(cover_path=rel_path)
    return {"status": "ok", "manga_id": manga_id, "path": rel_path}


@shared_task(name="employees.scheduled_mirror_covers")
def task_mirror_covers(batch: int = 100):
    """Pick up to ``batch`` mangás with a remote cover but no local copy and
    enqueue per-manga download tasks."""
    redis_client = _redis_for_locks()
    lock_key = "lock:scheduled_mirror_covers"
    if not redis_client.set(lock_key, "1", nx=True, ex=1800):
        return {"status": "skipped"}
    try:
        candidates = list(
            Manga.objects.filter(is_active=True, cover_path__isnull=True)
            .exclude(cover__isnull=True)
            .exclude(cover="")
            .order_by("-id")[:batch]
            .values_list("id", flat=True)
        )
        for manga_id in candidates:
            task_download_cover.delay(manga_id)
        return {"status": "ok", "queued": len(candidates)}
    finally:
        redis_client.delete(lock_key)


# ---------------------------------------------------------------------------
# Pre-fetch pages — when a chapter is followed by users, mirror its images
# locally so the reader serves from /media/ instead of streaming MangaDex.
# ---------------------------------------------------------------------------
PAGES_DIR = "chapter_pages"


@shared_task(name="employees.prefetch_chapter_pages", bind=True, max_retries=2)
def task_prefetch_chapter_pages(self, chapter_id: int):
    chapter = Chapter.objects.filter(id=chapter_id).select_related("manga").first()
    if not chapter or not chapter.mangadex_id:
        return {"status": "skipped", "chapter_id": chapter_id}
    if ChapterImage.objects.filter(chapter=chapter).exists():
        return {"status": "noop", "chapter_id": chapter_id}

    try:
        pages = get_mangadex_pages(chapter.mangadex_id)
    except RateLimitExceeded as exc:
        raise self.retry(exc=exc, countdown=60)

    if not pages:
        return {"status": "no_pages", "chapter_id": chapter_id}

    saved = 0
    for page in pages:
        url = page["image"]
        order = page["order"]
        ext = os.path.splitext(url.split("?", 1)[0])[1].lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        rel = f"{PAGES_DIR}/{chapter.id:08d}/{order:03d}{ext}"
        dest = Path(settings.MEDIA_ROOT) / rel
        try:
            _download_image(url, dest)
        except RequestException as exc:
            logger.warning("Page download falhou ch=%s pg=%s: %s", chapter_id, order, exc)
            continue
        ChapterImage.objects.update_or_create(
            chapter=chapter,
            order=order,
            defaults={"image": rel},
        )
        saved += 1

    return {"status": "ok", "chapter_id": chapter_id, "saved": saved}


# NOTE: there is no beat-scheduled bulk prefetch task. Bulk-mirroring every
# chapter of every favorited manga is unsustainable storage-wise (an old
# 1000-chapter series alone is ~12 GB). ``task_prefetch_chapter_pages`` above
# stays as an on-demand entry point — call it manually for a single chapter
# the user is actively about to read, or wire it from the frontend later.


@shared_task(name="employees.scheduled_cleanup_old_pages")
def task_cleanup_old_pages():
    """Remove ``ChapterImage`` records whose chapter has had no reading progress
    in ``PAGE_MIRROR_TTL_DAYS`` days, freeing disk. Only the local mirror is
    deleted — the chapter row stays so a future visit can re-fetch from MangaDex
    on demand (with the rate-limit-aware client).
    """
    from datetime import timedelta

    from django.utils import timezone

    cutoff = timezone.now() - timedelta(days=settings.PAGE_MIRROR_TTL_DAYS)

    # Chapters with images but no recent reading progress.
    try:
        from accounts.models import ReadingProgress  # local import

        active_chapter_ids = set(
            ReadingProgress.objects.filter(updated_at__gte=cutoff)
            .values_list("chapter_id", flat=True)
        )
    except Exception:  # pragma: no cover
        active_chapter_ids = set()

    stale_images = ChapterImage.objects.exclude(chapter_id__in=active_chapter_ids)
    deleted_files = 0
    deleted_rows = 0
    media_root = Path(settings.MEDIA_ROOT)
    for img in stale_images.iterator(chunk_size=500):
        rel = str(img.image)
        if rel:
            full = media_root / rel
            try:
                if full.is_file():
                    full.unlink()
                    deleted_files += 1
            except OSError as exc:
                logger.warning("Falha ao apagar %s: %s", full, exc)
        img.delete()
        deleted_rows += 1

    return {
        "status": "ok",
        "deleted_files": deleted_files,
        "deleted_rows": deleted_rows,
    }


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
