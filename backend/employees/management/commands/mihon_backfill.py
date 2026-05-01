"""Backfill profundo do catálogo Mihon via Suwayomi.

Pagina o endpoint `popular` de cada extensão instalada e importa metadados +
capítulos para o nosso DB. Idempotente — rodar de novo só atualiza, não
duplica. Lockable via Redis pra não rodar duas instâncias em paralelo.

Uso:
    docker exec nexus-backend python manage.py mihon_backfill
    docker exec nexus-backend python manage.py mihon_backfill --max-per-source 200 --rate 1.0
    docker exec nexus-backend python manage.py mihon_backfill --extensions hunters,sagrado --skip-chapters
    docker exec nexus-backend python manage.py mihon_backfill --resume

Flags:
  --max-per-source N   cap por extensão (default 300)
  --rate FLOAT         intervalo entre requests em segundos (default 1.0)
  --extensions IDS     CSV de inner_source_ids ou nomes; default = todas
  --skip-chapters      só metadados de mangás, sem fetch de capítulos (mais rápido)
  --resume             pula obras já no DB (mihon_<inner>:<mid> existente)

Cancelável com Ctrl+C — rows já criadas ficam intactas.
"""

from __future__ import annotations

import sys
import time
from typing import Iterable

import redis
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from employees.tasks import _persist_mihon_manga
from employees.models import Manga
from sources import registry as sources_registry


class Command(BaseCommand):
    help = "Backfill profundo de mangás via Mihon Network (Suwayomi)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--max-per-source", type=int, default=300,
            help="Maximo de obras por extensao (default 300).",
        )
        parser.add_argument(
            "--rate", type=float, default=1.0,
            help="Segundos de espera entre requests (default 1.0).",
        )
        parser.add_argument(
            "--extensions", type=str, default="",
            help="CSV de inner_source_ids (ex: '9117178890425713139,9215...') ou nomes parciais. Vazio = todas.",
        )
        parser.add_argument(
            "--skip-chapters", action="store_true",
            help="Pula fetch de capitulos — so importa metadados (~10x mais rapido).",
        )
        parser.add_argument(
            "--resume", action="store_true",
            help="Pula obras que ja existem no DB.",
        )

    def handle(self, *args, **opts):
        # Redis lock pra prevenir runs concorrentes
        rds = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        lock_key = "lock:mihon_backfill"
        if not rds.set(lock_key, "1", nx=True, ex=4 * 3600):
            raise CommandError("mihon_backfill ja esta rodando (lock no Redis). Aguarde ou apague a chave manualmente.")

        try:
            self._run(rds=rds, **opts)
        finally:
            rds.delete(lock_key)

    def _run(
        self,
        *,
        max_per_source: int,
        rate: float,
        extensions: str,
        skip_chapters: bool,
        resume: bool,
        rds,
        **_,
    ):
        src = sources_registry.get("mihon")
        if src is None or not getattr(src, "is_configured", False):
            raise CommandError(
                "Mihon nao configurado. Suba o Suwayomi (--profile mihon) e setting SUWAYOMI_URL."
            )

        all_sources = src._list_sources()
        if not all_sources:
            raise CommandError("Suwayomi nao tem nenhuma extensao instalada.")

        # Filtra por --extensions
        if extensions:
            wanted = [w.strip().lower() for w in extensions.split(",") if w.strip()]
            chosen = []
            for s in all_sources:
                sid = str(s.get("id") or "")
                name = (s.get("displayName") or s.get("name") or "").lower()
                if any(w == sid or w in name for w in wanted):
                    chosen.append(s)
            if not chosen:
                raise CommandError(f"Nenhuma extensao bate com --extensions={extensions}")
            all_sources = chosen

        # Skipa o "Local source" (id=0)
        all_sources = [s for s in all_sources if str(s.get("id") or "") not in ("0", "")]

        self._log(f"// MIHON_BACKFILL · {len(all_sources)} extensoes · cap={max_per_source}/ext · rate={rate}s")
        if skip_chapters:
            self._log("// MODO RAPIDO — capitulos serao pulados (so metadados)")

        total_imported = 0
        total_updated = 0
        total_chapters = 0
        total_failed = 0
        t_start = time.monotonic()

        for s in all_sources:
            inner_id = str(s.get("id") or "")
            name = s.get("displayName") or s.get("name") or inner_id
            self._log(f"\n┌─ {name} [{inner_id}]")

            page = 1
            collected = 0
            while collected < max_per_source:
                try:
                    dtos, has_next = src.browse(inner_id, kind="popular", page=page)
                except Exception as exc:
                    self._log(f"│  ✗ browse p={page} falhou: {exc}")
                    break

                if not dtos:
                    self._log(f"│  ◌ p={page} vazio — fim do catalogo")
                    break

                for dto in dtos:
                    if collected >= max_per_source:
                        break
                    collected += 1

                    if resume:
                        storage_id = f"mihon:{dto.external_id}"
                        if Manga.objects.filter(mangadex_id=storage_id).exists():
                            continue

                    try:
                        manga, created, chs = _persist_mihon_manga(
                            dto,
                            fetch_chapters_for=None if skip_chapters else dto.external_id,
                        )
                    except Exception as exc:
                        total_failed += 1
                        self._log(f"│  ✗ {dto.title[:40]}: {exc}")
                        continue

                    if created:
                        total_imported += 1
                        flag = "NEW"
                    else:
                        total_updated += 1
                        flag = "UPD"
                    total_chapters += chs

                    if total_imported % 25 == 0 and created:
                        elapsed = int(time.monotonic() - t_start)
                        self._log(
                            f"│  [{flag}] {dto.title[:40]:<40} ch={chs:>3} "
                            f"· tot={total_imported}new+{total_updated}upd ({elapsed}s)"
                        )

                    time.sleep(rate)

                if not has_next:
                    break
                page += 1

            self._log(f"└─ {name}: {collected} processados desta extensao")

        elapsed = int(time.monotonic() - t_start)
        self._log("\n" + "═" * 60)
        self._log(f"// BACKFILL_COMPLETE em {elapsed}s ({elapsed//60}m{elapsed%60}s)")
        self._log(f"   novos:           {total_imported}")
        self._log(f"   atualizados:     {total_updated}")
        self._log(f"   chapters_synced: {total_chapters}")
        self._log(f"   falhas:          {total_failed}")
        self._log("═" * 60)

    def _log(self, msg: str):
        self.stdout.write(msg)
        self.stdout.flush()
