"""Celery tasks do sistema de rank.

- ``recompute_ranks``: recalcula posições+tiers de todos os users da season
  ativa baseado no score atual. Roda diariamente 04:00 (depois do cleanup).
- ``close_season_if_due``: vira season ativa em inativa quando ends_at passa
  e cria a próxima. Roda horariamente.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import Season, UserSeasonStats
from .ranking import SEASON_DURATION, rank_for_score

logger = logging.getLogger(__name__)


@shared_task(name="accounts.recompute_ranks")
def recompute_ranks() -> dict:
    """Atualiza position + tier persistido dos UserSeasonStats da season.

    Algoritmo:
      1. Ordena por -score → atribui position 1..N
      2. Tier vem de ``rank_for_score(score)`` (threshold absoluto)
      3. peak_rank só sobe, nunca desce

    Endpoints já calculam tier/position AO VIVO via ``rank_for_score`` e
    contagem de scores maiores — esta task mantém o cache em sync e é a
    fonte da verdade pra peak_rank no DB.
    """
    season = Season.current()
    if season is None:
        return {"season": None, "updated": 0}

    stats = list(
        UserSeasonStats.objects.filter(season=season)
        .only("id", "score", "position", "rank_tier", "peak_rank_tier")
        .order_by("-score", "id")
    )
    total = len(stats)
    if total == 0:
        return {"season": season.slug, "updated": 0}

    now = timezone.now()
    to_update = []
    for idx, s in enumerate(stats):
        position = idx + 1
        rank = rank_for_score(s.score)
        new_peak = max(s.peak_rank_tier, rank.tier)
        if (
            s.position != position
            or s.rank_tier != rank.tier
            or s.peak_rank_tier != new_peak
        ):
            s.position = position
            s.rank_tier = rank.tier
            s.peak_rank_tier = new_peak
            s.computed_at = now
            to_update.append(s)

    if to_update:
        UserSeasonStats.objects.bulk_update(
            to_update,
            ["position", "rank_tier", "peak_rank_tier", "computed_at"],
            batch_size=500,
        )

    return {"season": season.slug, "updated": len(to_update), "total": total}


@shared_task(name="accounts.close_season_if_due")
def close_season_if_due() -> dict:
    """Fecha a season ativa se ends_at já passou, e cria a próxima.

    Não copia stats — cada season começa zerada. Histórico de peak rank
    da season anterior fica preservado no UserSeasonStats antigo.
    """
    now = timezone.now()
    season = Season.current()
    if season is None:
        # Nenhuma season — cria a inaugural a partir de agora.
        return _create_next_season(starts_at=now)

    if season.ends_at > now:
        return {"closed": False, "active": season.slug}

    with transaction.atomic():
        season.is_active = False
        season.save(update_fields=["is_active"])
        result = _create_next_season(starts_at=season.ends_at)

    return {"closed": season.slug, **result}


def _create_next_season(*, starts_at) -> dict:
    """Cria a próxima season de 3 meses começando em ``starts_at``.

    Naming convention: ``season-YYYY-Q`` onde Q é o trimestre (1-4) baseado
    no mês de início. Ex: começa em 2026-05-13 → Q2 → ``season-2026-q2``.
    """
    quarter = ((starts_at.month - 1) // 3) + 1
    slug = f"season-{starts_at.year}-q{quarter}"
    name = f"Season {starts_at.year} Q{quarter}"
    season, created = Season.objects.get_or_create(
        slug=slug,
        defaults={
            "name": name,
            "starts_at": starts_at,
            "ends_at": starts_at + SEASON_DURATION,
            "is_active": True,
        },
    )
    if not created and not season.is_active:
        season.is_active = True
        season.save(update_fields=["is_active"])
    return {"created": created, "active": season.slug}
