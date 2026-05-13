"""Sistema de rank competitivo por season.

8 tiers cyberpunk-themed (Sewer Rat → Saburo's Hand). Promo/rebaixamento por
percentil global recalculado periodicamente — score baseado em capítulos
lidos, obras completadas, e tempo de leitura.

Constantes e helpers vivem aqui pra ficar fácil de tunar sem mexer em models
ou views.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


# ---------------------------------------------------------------------------
# Tabela de ranks
# ---------------------------------------------------------------------------
# Cada tier: (tier_index, slug, display_name, max_percentile).
# ``max_percentile`` é o limite SUPERIOR do percentil pra pertencer a esse tier
# (menor percentil = melhor posição). Ex: top 0.5% = saburos-hand.
# Sewer Rat absorve o resto (>80%).

@dataclass(frozen=True)
class Rank:
    tier: int
    slug: str
    name: str
    max_percentile: float  # incluído no tier se percentile <= max_percentile


RANKS: tuple[Rank, ...] = (
    Rank(7, "saburos-hand", "Saburo's Hand", 0.5),
    Rank(6, "director", "Director", 2.0),
    Rank(5, "lieutenant", "Lieutenant", 7.0),
    Rank(4, "solo", "Solo", 15.0),
    Rank(3, "netrunner", "Netrunner", 30.0),
    Rank(2, "fixer", "Fixer", 50.0),
    Rank(1, "street-kid", "Street Kid", 80.0),
    Rank(0, "sewer-rat", "Sewer Rat", 100.0),
)

# Slug → Rank lookup
RANK_BY_TIER: dict[int, Rank] = {r.tier: r for r in RANKS}


def rank_for_percentile(percentile: float) -> Rank:
    """Recebe percentil (0.0 = topo, 100.0 = fim) e devolve o Rank.

    Iteração no sorted RANKS (top-down): primeiro tier cujo ``max_percentile``
    cobre o percentil ganha.
    """
    for r in RANKS:
        if percentile <= r.max_percentile:
            return r
    return RANK_BY_TIER[0]


# ---------------------------------------------------------------------------
# Pontuação
# ---------------------------------------------------------------------------
# Capítulo lido: pontuação base, disparada quando ReadingProgress.completed
# vira True pela primeira vez no chapter+season.
POINTS_CHAPTER = 10

# Bônus por terminar obra inteira: multiplica nº de chapters do manga.
# Escala com tamanho — Solo Leveling (200+ caps) vale muito mais que um
# one-shot. Dispara uma vez por (user, manga, season).
POINTS_WORK_BONUS_PER_CHAPTER = 5

# Tempo de leitura: 1 ponto por 5 minutos ativos por capítulo, cap em 30 min.
# Aproximação via ``updated_at - created_at`` do ReadingProgress; cap evita
# abas esquecidas inflarem pontos.
READING_TIME_CAP_SECONDS = 30 * 60
READING_TIME_SECONDS_PER_POINT = 5 * 60


def reading_time_points(start, end) -> int:
    """Converte duração (start→end datetimes) em pontos, com cap."""
    if start is None or end is None or end <= start:
        return 0
    elapsed = (end - start).total_seconds()
    capped = min(elapsed, READING_TIME_CAP_SECONDS)
    return int(capped // READING_TIME_SECONDS_PER_POINT)


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------
# 3 meses por season. Reset zera score, mantém histórico de peak rank.
SEASON_DURATION = timedelta(days=90)
