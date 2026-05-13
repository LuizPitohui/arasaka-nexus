"""Bulk catalog seed por popularidade.

Pagina o catalogo MangaDex ordenado por followedCount desc — pega os
mangas MAIS POPULARES primeiro. Pra cada um nao presente no DB local,
enfileira ``task_import_manga_chapters`` no Celery (importacao em
paralelo respeitando concurrency=2 do worker).

Uso tipico (1x apos deploy pra ter catalogo decente):
    python manage.py seed_popular --max 5000

Posteriores incrementais (ex: pegar mais 5k):
    python manage.py seed_popular --max 10000 --skip 5000

Dry-run pra ver quanto seria importado sem despachar:
    python manage.py seed_popular --max 1000 --dry-run

Tempo estimado: ~5-10s por manga × N mangas / 2 workers paralelos.
5k mangas = ~7h. Roda em background sem bloquear.
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

# MangaDex API: max 100 por chamada de /manga. Offset maximo 10000
# (api retorna 400 acima). Pra superar precisariamos usar createdAtSince
# (como faz seed_library).
MAX_OFFSET = 9900
PAGE_SIZE = 100


class Command(BaseCommand):
    help = "Pagina o catalogo MangaDex por popularidade e enfileira imports em massa."

    def add_arguments(self, parser):
        parser.add_argument(
            "--max", type=int, default=5000,
            help="Maximo de mangas a inspecionar (ate 9900 — limite hard do MangaDex offset).",
        )
        parser.add_argument(
            "--skip", type=int, default=0,
            help="Offset inicial pra pular os primeiros N (continuar de onde parou).",
        )
        parser.add_argument(
            "--order",
            type=str,
            default="followedCount",
            choices=("followedCount", "rating", "latestUploadedChapter", "createdAt", "updatedAt"),
            help="Criterio de ordenacao do MangaDex.",
        )
        parser.add_argument(
            "--languages",
            nargs="+",
            default=["pt-br", "en"],
            help="Linguas de tradução requeridas (pelo menos 1).",
        )
        parser.add_argument(
            "--include-adult",
            action="store_true",
            help="Inclui erotica + pornographic (default: so safe/suggestive).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="So reporta o que seria importado; nao despacha tasks.",
        )
        parser.add_argument(
            "--sleep",
            type=float,
            default=0.5,
            help="Pausa entre paginas (segundos) pra suavizar carga na API.",
        )

    def handle(self, *args, **options):
        max_n = min(MAX_OFFSET, max(1, options["max"]))
        skip = max(0, options["skip"])
        order_key = options["order"]
        languages = options["languages"]
        ratings = (
            ["safe", "suggestive", "erotica", "pornographic"]
            if options["include_adult"]
            else ["safe", "suggestive"]
        )
        dry_run = options["dry_run"]
        sleep_s = options["sleep"]

        client = get_client()
        already_have_total = Manga.objects.filter(is_active=True).count()
        self.stdout.write(
            self.style.WARNING(
                f"// SEED_POPULAR start — max={max_n} skip={skip} order={order_key} "
                f"langs={languages} ratings={'ALL' if options['include_adult'] else 'SAFE'} "
                f"dry_run={dry_run}"
            )
        )
        self.stdout.write(f"// catalogo local atual: {already_have_total} mangas")

        scanned = 0
        seen_ids: list[str] = []
        dispatched = 0
        already_have = 0

        offset = skip
        while scanned < max_n and offset < MAX_OFFSET:
            page_limit = min(PAGE_SIZE, max_n - scanned, MAX_OFFSET - offset)
            params = {
                "limit": page_limit,
                "offset": offset,
                "includes[]": "cover_art",
                "availableTranslatedLanguage[]": languages,
                "contentRating[]": ratings,
                "hasAvailableChapters": "true",
                f"order[{order_key}]": "desc",
            }
            try:
                payload = client.list_manga(**params)
            except RateLimitExceeded as exc:
                self.stdout.write(
                    self.style.ERROR(f"rate limit no offset {offset}: {exc}. encerrando.")
                )
                break
            except HTTPError as exc:
                self.stdout.write(
                    self.style.ERROR(f"HTTP erro offset {offset}: {exc}. encerrando.")
                )
                break
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"falha inesperada offset {offset}: {exc}. encerrando.")
                )
                break

            items = payload.get("data", []) or []
            if not items:
                self.stdout.write(self.style.SUCCESS("// fim do catalogo alcancado"))
                break

            ids_in_batch = [m.get("id") for m in items if m.get("id")]
            seen_ids.extend(ids_in_batch)

            # Filtra: so dispatcha os que NAO estao no DB ainda
            existing = set(
                Manga.objects.filter(mangadex_id__in=ids_in_batch).values_list(
                    "mangadex_id", flat=True
                )
            )
            new_ids = [mid for mid in ids_in_batch if mid not in existing]
            already_have += len(ids_in_batch) - len(new_ids)

            if not dry_run:
                for mid in new_ids:
                    task_import_manga_chapters.delay(mid)
            dispatched += len(new_ids)

            scanned += len(items)
            offset += len(items)

            self.stdout.write(
                f"// page offset={offset - len(items)}..{offset} "
                f"novos={len(new_ids)} ja_tinha={len(ids_in_batch) - len(new_ids)} "
                f"acumulado_dispatched={dispatched}"
            )

            if len(items) < page_limit:
                self.stdout.write(self.style.SUCCESS("// fim do catalogo"))
                break

            if sleep_s > 0:
                time.sleep(sleep_s)

        verb = "seriam dispachadas" if dry_run else "dispachadas"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n// DONE — escaneados={scanned} ja_no_db={already_have} {verb}={dispatched}"
            )
        )
        if not dry_run and dispatched:
            self.stdout.write(
                f"// Acompanhe via Celery: tail dos logs do nexus-worker ou "
                f"Manga.objects.count() periodico."
            )
