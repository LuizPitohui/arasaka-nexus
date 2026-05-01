"""Retrofit: popula Chapter.published_at em capítulos Mihon já existentes.

Para cada Manga importado via Mihon, refaz fetch_chapters via Suwayomi e
atualiza ``published_at`` em rows existentes (não cria novos).

Uso:
    docker exec nexus-backend python manage.py mihon_backfill_published_at
    docker exec nexus-backend python manage.py mihon_backfill_published_at --rate 0.5

Idempotente. Se já tem published_at, pula. Cancelável com Ctrl+C.
"""

from __future__ import annotations

import time

import redis
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from employees.models import Manga, Chapter
from sources import registry as sources_registry


class Command(BaseCommand):
    help = "Retrofit Chapter.published_at em mangás Mihon já importados"

    def add_arguments(self, parser):
        parser.add_argument(
            "--rate", type=float, default=0.3,
            help="Segundos entre requests Suwayomi (default 0.3).",
        )
        parser.add_argument(
            "--limit", type=int, default=0,
            help="Limita a N mangás (default 0 = todos).",
        )

    def handle(self, *args, **opts):
        rate = opts["rate"]
        limit = opts["limit"]

        rds = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        lock_key = "lock:mihon_backfill_published_at"
        if not rds.set(lock_key, "1", nx=True, ex=2 * 3600):
            raise CommandError("retrofit ja em execucao. Limpe lock manualmente se necessario.")

        try:
            src = sources_registry.get("mihon")
            if src is None or not getattr(src, "is_configured", False):
                raise CommandError("Mihon nao configurado")

            mangas_qs = Manga.objects.filter(source_id="mihon").order_by("id")
            if limit:
                mangas_qs = mangas_qs[:limit]
            total_mangas = mangas_qs.count()

            self.stdout.write(f"// RETROFIT_PUBLISHED_AT · {total_mangas} mangas · rate={rate}s")

            updated_chapters = 0
            skipped_chapters = 0
            failed_mangas = 0

            for i, manga in enumerate(mangas_qs.iterator(), 1):
                if not manga.mangadex_id or not manga.mangadex_id.startswith("mihon:"):
                    continue
                external_id = manga.mangadex_id[len("mihon:"):]
                try:
                    chapters_dto = src.fetch_chapters(external_id)
                except Exception as exc:
                    failed_mangas += 1
                    self.stdout.write(f"  ✗ #{manga.id} {manga.title[:30]}: {exc}")
                    continue

                # Map external_id -> published_at
                pub_map = {
                    f"mihon:{cd.external_id}": cd.published_at
                    for cd in chapters_dto
                    if cd.published_at
                }
                if not pub_map:
                    skipped_chapters += 1  # contagem: mangas sem dados upstream
                    continue

                # Update apenas chapters que ainda nao tem published_at
                rows = Chapter.objects.filter(
                    manga=manga, source_id="mihon", published_at__isnull=True
                )
                for ch in rows:
                    pub = pub_map.get(ch.mangadex_id)
                    if pub:
                        ch.published_at = pub
                        ch.save(update_fields=["published_at"])
                        updated_chapters += 1

                if i % 25 == 0:
                    self.stdout.write(
                        f"  [{i}/{total_mangas}] updated_chapters={updated_chapters} "
                        f"failed_mangas={failed_mangas}"
                    )
                time.sleep(rate)

            self.stdout.write("\n" + "═" * 60)
            self.stdout.write(f"// RETROFIT_COMPLETE")
            self.stdout.write(f"   chapters atualizados: {updated_chapters}")
            self.stdout.write(f"   mangas com falha:     {failed_mangas}")
            self.stdout.write("═" * 60)
        finally:
            rds.delete(lock_key)
