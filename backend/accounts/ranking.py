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
    # Score mínimo (inclusive) pra estar nesse tier. User com score >=
    # min_score do tier N e < min_score do tier N+1 pertence ao tier N.
    # Modelo absoluto (estilo Valorant Iron→Immortal): user solo consegue
    # promover acumulando pontos, sem depender de outros agentes.
    min_score: int


RANKS: tuple[Rank, ...] = (
    # Tabela endurecida (rebalance 2026-05): farmar lista pessoal e marcar
    # "lidos em lote" nao concedem mais pontos. Pontuacao base reduzida a
    # metade e exige >=30s no capitulo. Saburo's Hand virou efetivamente
    # inalcancavel sem leitura prolongada (~20k+ caps legitimos/season).
    Rank(7, "saburos-hand", "Saburo's Hand", 200_000),
    Rank(6, "director", "Director", 75_000),
    Rank(5, "lieutenant", "Lieutenant", 25_000),
    Rank(4, "solo", "Solo", 10_000),
    Rank(3, "netrunner", "Netrunner", 3_000),
    Rank(2, "fixer", "Fixer", 700),
    Rank(1, "street-kid", "Street Kid", 100),
    Rank(0, "sewer-rat", "Sewer Rat", 0),
)

# Slug → Rank lookup
RANK_BY_TIER: dict[int, Rank] = {r.tier: r for r in RANKS}


def rank_for_score(score: int) -> Rank:
    """Devolve o Rank do user dado seu score atual.

    Itera no sorted RANKS top-down: primeiro tier cujo ``min_score`` o
    score satisfaz vence. Cresce monotonicamente — nunca regride com
    pontuação maior.
    """
    for r in RANKS:  # já vem do tier mais alto pro mais baixo
        if score >= r.min_score:
            return r
    return RANK_BY_TIER[0]


# ---------------------------------------------------------------------------
# Pontuação
# ---------------------------------------------------------------------------
# Capítulo lido: pontuação base, disparada quando ReadingProgress.completed
# vira True pela primeira vez no chapter+season.
POINTS_CHAPTER = 5

# Bônus por terminar obra inteira: multiplica nº de chapters do manga.
# Escala com tamanho — Solo Leveling (200+ caps) vale muito mais que um
# one-shot. Dispara uma vez por (user, manga, season).
POINTS_WORK_BONUS_PER_CHAPTER = 3

# Tempo de leitura: 1 ponto por 5 minutos ativos por capítulo, cap em 30 min.
# Aproximação via ``updated_at - created_at`` do ReadingProgress; cap evita
# abas esquecidas inflarem pontos.
READING_TIME_CAP_SECONDS = 30 * 60
READING_TIME_SECONDS_PER_POINT = 5 * 60

# ---------------------------------------------------------------------------
# Anti-farm: gate de engajamento minimo
# ---------------------------------------------------------------------------
# Tempo minimo (segundos) entre abrir o capitulo (ReadingProgress.created_at)
# e marcar como lido (updated_at) pra concessao de pontos. Abaixo disso o
# capitulo fica registrado como lido (estado de UI/badge respeitado), mas
# NAO gera ScoreEvent. Mata o exploit de "abrir cap → fechar → next cap"
# rolando em segundos, e o pior caso de oneshots de 1 pagina.
#
# 30s e generoso pra capitulos curtos legitimos (light webtoons de 5-10
# paineis). Capitulos longos naturalmente ultrapassam.
MIN_READ_SECONDS_FOR_POINTS = 30


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
