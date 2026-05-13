"""Temporal sweep of MangaDex — varre o catalogo INTEIRO via createdAtSince.

Diferente do seed_popular (limitado a 9900 mangas pelo offset cap do
MangaDex), esse command usa cursor temporal (createdAt asc) sem limite —
em teoria puxa cada manga ja cadastrado. Ideal pra primeira seed bruta.

Cada batch enfileira ``task_import_manga_chapters`` no Celery; o command
em si so navega o cursor.

Uso:
    # Varredura completa pt-br + en desde 2010 (default)
    python manage.py seed_library

    # So pt-br
    python manage.py seed_library --languages pt-br

    # Incluir adult
    python manage.py seed_library --include-adult

    # Cap em 20k mangas pra teste
    python manage.py seed_library --max-total 20000

    # Idempotente: pula ids ja no DB (evita re-enfileirar import que ja
    # vai dar no-op no scanner). Liga com --skip-existing.
"""

from __future__ import annotations

import logging
import time

from django.core.management.base import BaseCommand
from requests.exceptions import HTTPError

from employees.mangadex_client import RateLimitExceeded, get_client
from employees.models import Manga
from employees.tasks import task_import_manga_chapters

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Varredura temporal completa da MangaDex usando createdAtSince cursor. "
        "Pra alem do limite de 9900 offsets do seed_popular."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--start-date", type=str, default="2010-01-01T00:00:00",
            help="Data ISO (YYYY-MM-DDTHH:MM:SS) — ponto de partida do cursor.",
        )
        parser.add_argument(
            "--batch-size", type=int, default=100,
            help="Tamanho do batch (max 100 pelo MangaDex).",
        )
        parser.add_argument(
            "--languages",
            nargs="+",
            default=["pt-br", "en"],
            help="Linguas requeridas pra availableTranslatedLanguage[]",
        )
        parser.add_argument(
            "--include-adult", action="store_true",
            help="Inclui erotica + pornographic (default: so safe/suggestive)",
        )
        parser.add_argument(
            "--max-total", type=int, default=0,
            help="Cap absoluto de mangas escaneados (0 = sem limite, varre tudo)",
        )
        parser.add_argument(
            "--skip-existing", action="store_true",
            help="Nao re-enfileira imports pra mangas ja presentes no DB",
        )
        parser.add_argument(
            "--sleep", type=float, default=0.3,
            help="Pausa entre paginas (s) — suaviza carga na API",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Reporta o que seria importado sem despachar",
        )

    def handle(self, *args, **options):
        cursor = options["start_date"]
        batch_size = min(100, max(1, options["batch_size"]))
        languages = options["languages"]
        ratings = (
            ["safe", "suggestive", "erotica", "pornographic"]
            if options["include_adult"]
            else ["safe", "suggestive"]
        )
        max_total = options["max_total"]
        skip_existing = options["skip_existing"]
        dry_run = options["dry_run"]
        sleep_s = options["sleep"]

        client = get_client()

        self.stdout.write(
            self.style.WARNING(
                f"// SEED_LIBRARY start cursor={cursor} langs={languages} "
                f"ratings={'ALL' if options['include_adult'] else 'SAFE'} "
                f"max={'inf' if max_total == 0 else max_total} "
                f"skip_existing={skip_existing} dry_run={dry_run}"
            )
        )
        starting_count = Manga.objects.filter(is_active=True).count()
        self.stdout.write(f"// catalogo atual: {starting_count} mangas")

        scanned = 0
        dispatched = 0
        skipped = 0

        while True:
            if max_total and scanned >= max_total:
                self.stdout.write(self.style.SUCCESS(f"// cap atingido ({max_total})"))
                break

            params = {
                "limit": batch_size,
                "offset": 0,
                "availableTranslatedLanguage[]": languages,
                "contentRating[]": ratings,
                "hasAvailableChapters": "true",
                "order[createdAt]": "asc",
                "createdAtSince": cursor,
            }

            try:
                payload = client.list_manga(**params)
            except RateLimitExceeded as exc:
                self.stdout.write(
                    self.style.ERROR(f"rate limit ({cursor}): {exc}. encerrando.")
                )
                break
            except HTTPError as exc:
                self.stdout.write(self.style.ERROR(f"HTTP {cursor}: {exc}. encerrando."))
                break
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(
                        f"falha inesperada em {cursor}: {exc}. "
                        f"continue com --start-date {cursor}"
                    )
                )
                break

            mangas = payload.get("data", []) or []
            if not mangas:
                self.stdout.write(self.style.SUCCESS("// fim do catalogo alcancado"))
                break

            ids = [m.get("id") for m in mangas if m.get("id")]
            existing = (
                set(
                    Manga.objects.filter(mangadex_id__in=ids).values_list(
                        "mangadex_id", flat=True
                    )
                )
                if skip_existing
                else set()
            )
            for m in mangas:
                mid = m.get("id")
                if not mid:
                    continue
                if mid in existing:
                    skipped += 1
                    continue
                if not dry_run:
                    task_import_manga_chapters.delay(mid)
                dispatched += 1

            scanned += len(mangas)

            last_created = (mangas[-1].get("attributes") or {}).get("createdAt", "")
            if not last_created:
                self.stdout.write(
                    self.style.WARNING("cursor sem createdAt; encerrando.")
                )
                break
            cursor = last_created[:19]

            self.stdout.write(
                f"// batch=+{len(mangas)} cursor={cursor} "
                f"dispatched={dispatched} skipped={skipped} scanned={scanned}"
            )

            if sleep_s > 0:
                time.sleep(sleep_s)

        verb = "seriam dispachadas" if dry_run else "dispachadas"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n// DONE — escaneados={scanned} {verb}={dispatched} ja_no_db={skipped}"
            )
        )
