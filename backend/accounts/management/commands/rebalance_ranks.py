"""Recalcula tier + peak de todos os users apos mudanca da tabela RANKS.

A task ``recompute_ranks`` rotineira nao reseta ``peak_rank_tier`` — ela
so sobe (``max(peak, current)``). Depois de endurecer a tabela em
``accounts/ranking.py``, gente que ja tinha peak inflado fica com badge
de tier inalcancavel sob as novas regras.

Esse command sobrescreve peak pra alinhar com o score real sob a tabela
ATUAL. Rodar UMA vez apos cada rebalance manual.

Uso:
    python manage.py rebalance_ranks            # aplica
    python manage.py rebalance_ranks --dry-run  # so reporta o que mudaria
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Season, UserSeasonStats
from accounts.ranking import rank_for_score


class Command(BaseCommand):
    help = (
        "Recalcula rank_tier + peak_rank_tier de todos os UserSeasonStats "
        "apos mudanca da tabela RANKS."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="So mostra quantos seriam ajustados, sem gravar.",
        )
        parser.add_argument(
            "--all-seasons",
            action="store_true",
            help="Rebalanceia TODAS as seasons (default: so a ativa).",
        )

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        all_seasons = opts["all_seasons"]

        qs = UserSeasonStats.objects.all()
        if not all_seasons:
            season = Season.current()
            if season is None:
                self.stdout.write("Sem season ativa. Nada a fazer.")
                return
            qs = qs.filter(season=season)

        stats = list(qs.only("id", "score", "rank_tier", "peak_rank_tier"))
        now = timezone.now()
        changed = []
        demoted = 0
        for s in stats:
            rank = rank_for_score(s.score)
            new_tier = rank.tier
            new_peak = rank.tier  # sobrescreve — sem max() aqui
            if s.rank_tier != new_tier or s.peak_rank_tier != new_peak:
                if s.peak_rank_tier > new_peak:
                    demoted += 1
                s.rank_tier = new_tier
                s.peak_rank_tier = new_peak
                s.computed_at = now
                changed.append(s)

        msg = (
            f"Total: {len(stats)} | Ajustados: {len(changed)} | "
            f"Rebaixados (peak): {demoted}"
        )
        self.stdout.write(msg)

        if dry:
            self.stdout.write("DRY-RUN — nada gravado.")
            return

        if changed:
            UserSeasonStats.objects.bulk_update(
                changed,
                ["rank_tier", "peak_rank_tier", "computed_at"],
                batch_size=500,
            )
        self.stdout.write(self.style.SUCCESS("Rebalance concluido."))
