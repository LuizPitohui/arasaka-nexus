"""Espelha ReadingProgress.completed entre variantes do mesmo Work.

Backfill historico: pra users que liam o sistema ANTES da Phase 1B
(commit b677596 — write propagation), capitulos lidos numa variante
nao apareciam marcados nas outras. Esse command corrige isso
retroativamente.

Idempotente: roda quantas vezes quiser, so cria entradas faltantes.
Nao dispara double-scoring (signal ja deduplica por work + chapter.number).

Uso:
    python manage.py sync_progress_to_work_siblings           # roda
    python manage.py sync_progress_to_work_siblings --dry-run # so reporta
"""

from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import ReadingProgress
from employees.models import Chapter


class Command(BaseCommand):
    help = "Espelha ReadingProgress.completed=True entre capitulos irmaos (mesmo Work + number)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="So reporta o que seria criado, sem persistir",
        )
        parser.add_argument(
            "--user", type=int, default=None,
            help="Limita a um user_id especifico (debug/teste)",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        user_filter = options.get("user")

        # 1. Carrega todas as ReadingProgress completadas (com manga+work info)
        qs = (
            ReadingProgress.objects.filter(completed=True)
            .select_related("chapter__manga")
            .only(
                "id", "user_id", "chapter_id",
                "chapter__number", "chapter__manga_id",
                "chapter__manga__work_id",
            )
        )
        if user_filter:
            qs = qs.filter(user_id=user_filter)

        total_existing = qs.count()
        self.stdout.write(f"// {total_existing} ReadingProgress completadas a inspecionar")

        # 2. Indexa: (user_id, work_id, chapter_number) -> set de chapter_ids ja marcados
        # Tambem coleta: (work_id, chapter_number) -> set de TODOS os chapter_ids irmaos
        already_marked: dict[tuple, set[int]] = defaultdict(set)
        for rp in qs.iterator(chunk_size=500):
            ch = rp.chapter
            wid = ch.manga.work_id
            if not wid:
                continue
            already_marked[(rp.user_id, wid, ch.number)].add(ch.id)

        # 3. Pra cada (user, work, number), descobre quais sibling chapters
        # NAO estao marcados e cria ReadingProgress pra eles
        work_chapter_keys = {(wid, num) for (_uid, wid, num) in already_marked.keys()}
        sibling_chapters: dict[tuple, set[int]] = defaultdict(set)
        if work_chapter_keys:
            # Busca em batch — pra cada (work_id, number) que aparece, todos os chapter_ids
            work_ids = {wid for wid, _ in work_chapter_keys}
            numbers = {num for _, num in work_chapter_keys}
            for ch in Chapter.objects.filter(
                manga__work_id__in=work_ids, number__in=numbers
            ).only("id", "number", "manga__work_id"):
                sibling_chapters[(ch.manga.work_id, ch.number)].add(ch.id)

        # 4. Calcula o que falta criar
        to_create: list[ReadingProgress] = []
        for (user_id, work_id, number), marked_ids in already_marked.items():
            all_siblings = sibling_chapters.get((work_id, number), set())
            missing = all_siblings - marked_ids
            for chapter_id in missing:
                to_create.append(
                    ReadingProgress(
                        user_id=user_id,
                        chapter_id=chapter_id,
                        completed=True,
                        page_number=0,
                    )
                )

        self.stdout.write(
            f"// {len(to_create)} novas ReadingProgress a criar "
            f"(cobrindo {len({(rp.user_id, rp.chapter_id) for rp in to_create})} pares user-chapter)"
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY-RUN: nada persistido."))
            # Amostra pra inspecao
            for rp in to_create[:5]:
                self.stdout.write(f"  user_id={rp.user_id} chapter_id={rp.chapter_id}")
            return

        if not to_create:
            self.stdout.write(self.style.SUCCESS("Nada a fazer — base ja sincronizada."))
            return

        # 5. bulk_create com ignore_conflicts pra resistir a race conditions
        # (signal ja deduplica scoring; aqui evita falhar se entrada surgir
        # mid-migration).
        with transaction.atomic():
            ReadingProgress.objects.bulk_create(
                to_create, ignore_conflicts=True, batch_size=500,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"OK — {len(to_create)} entries criadas. ScoreEvents NAO sao "
                f"emitidos retroativamente (signal so dispara em save() ao "
                f"vivo); pontos historicos da Phase 1A ficam como estao."
            )
        )
