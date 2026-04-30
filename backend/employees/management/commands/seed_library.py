"""Temporal sweep of MangaDex.

Walks the MangaDex catalogue in chronological order using ``createdAtSince`` as
a cursor. Each batch is enqueued in Celery so the worker handles the heavy
lifting (and respects the centralized rate limiter) — this command itself only
talks to MangaDex via the same client to fetch the next cursor.
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from requests.exceptions import HTTPError

from employees.mangadex_client import RateLimitExceeded, get_client
from employees.tasks import task_import_manga_chapters

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Varredura temporal da MangaDex (Máquina do Tempo) usando o cliente centralizado."

    def add_arguments(self, parser):
        parser.add_argument(
            "--start-date",
            type=str,
            default="2018-01-01T00:00:00",
            help="Data ISO (YYYY-MM-DDTHH:MM:SS) — ponto de partida da varredura.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="Tamanho do lote por chamada (máx. 100 pelo MangaDex).",
        )

    def handle(self, *args, **options):
        cursor = options["start_date"]
        batch_size = min(100, max(1, options["batch_size"]))
        client = get_client()

        self.stdout.write(self.style.WARNING(f"--- Varredura iniciando em {cursor} ---"))
        total_enqueued = 0

        while True:
            self.stdout.write(f">> Buscando {batch_size} mangás criados após {cursor}")

            params = {
                "limit": batch_size,
                "offset": 0,
                "availableTranslatedLanguage[]": ["pt-br"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
                "hasAvailableChapters": "true",
                "order[createdAt]": "asc",
                "createdAtSince": cursor,
            }

            try:
                payload = client.list_manga(**params)
            except RateLimitExceeded as exc:
                self.stdout.write(
                    self.style.ERROR(f"Rate limit excedido pelo cliente: {exc}. Encerrando.")
                )
                break
            except HTTPError as exc:
                self.stdout.write(self.style.ERROR(f"Erro HTTP: {exc}. Encerrando."))
                break
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"Falha inesperada: {exc}. Reinicie com --start-date {cursor}")
                )
                break

            mangas = payload.get("data", [])
            if not mangas:
                self.stdout.write(self.style.SUCCESS("*** Varredura concluída. ***"))
                break

            for manga in mangas:
                manga_id = manga.get("id")
                if manga_id:
                    task_import_manga_chapters.delay(manga_id)

            count = len(mangas)
            total_enqueued += count

            last_created = (mangas[-1].get("attributes") or {}).get("createdAt", "")
            if not last_created:
                self.stdout.write(self.style.WARNING("Cursor temporal não encontrado; encerrando."))
                break
            cursor = last_created[:19]

            self.stdout.write(
                self.style.SUCCESS(
                    f"   + {count} enfileirados. Total: {total_enqueued}. Próximo: {cursor}"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(f"--- Operação encerrada. Total enfileirado: {total_enqueued} ---")
        )
