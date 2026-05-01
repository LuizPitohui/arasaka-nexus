"""Lógica de cálculo de saúde a partir dos logs.

Regras (configuráveis por settings):

    DOWN       = N falhas consecutivas (default 3) ou error_rate_5m > 80%
    DEGRADED   = error_rate_5m entre 10% e 80%, OU parser drift detectado,
                 OU p95 latência > 3x baseline configurado
    UP         = resto

`down_since` é fixado na primeira falha de uma sequência ininterrupta. Quando
um sucesso chega, é zerado.
"""

from __future__ import annotations

import statistics
from datetime import timedelta
from typing import Optional

from django.utils import timezone

from sources.models import Source, SourceHealth, SourceHealthLog

WINDOW_MINUTES = 5
CONSECUTIVE_FAILURES_DOWN = 3
ERROR_RATE_DOWN = 0.8
ERROR_RATE_DEGRADED = 0.1


def recompute_health(source: Source) -> SourceHealth:
    """Recalcula SourceHealth com base nos últimos `WINDOW_MINUTES` minutos."""
    now = timezone.now()
    window_start = now - timedelta(minutes=WINDOW_MINUTES)

    health, _ = SourceHealth.objects.get_or_create(source=source)

    logs = list(
        SourceHealthLog.objects.filter(
            source=source,
            checked_at__gte=window_start,
        ).order_by("-checked_at")
    )

    if not logs:
        # Sem dados na janela; mantém o que estava.
        health.last_check_at = now
        health.save(update_fields=["last_check_at"])
        return health

    total = len(logs)
    failures = sum(1 for log in logs if not log.success)
    error_rate = failures / total

    latencies = [log.latency_ms for log in logs if log.latency_ms is not None]
    avg_latency = int(statistics.fmean(latencies)) if latencies else 0
    p95_latency = _percentile(latencies, 0.95) if latencies else 0

    # Falhas consecutivas (do mais recente pra trás).
    consecutive = 0
    for log in logs:
        if log.success:
            break
        consecutive += 1

    most_recent = logs[0]
    last_success = next((log for log in logs if log.success), None)
    last_failure = next((log for log in logs if not log.success), None)

    parser_drift = _detect_parser_drift(logs)

    if consecutive >= CONSECUTIVE_FAILURES_DOWN or error_rate >= ERROR_RATE_DOWN:
        status = SourceHealth.STATUS_DOWN
    elif parser_drift or error_rate >= ERROR_RATE_DEGRADED:
        status = SourceHealth.STATUS_DEGRADED
    else:
        status = SourceHealth.STATUS_UP

    # down_since: fixado na primeira falha contínua, limpo quando volta.
    if status == SourceHealth.STATUS_DOWN:
        if not health.down_since:
            health.down_since = (last_failure.checked_at if last_failure else now)
    else:
        health.down_since = None

    health.status = status
    health.last_check_at = now
    if last_success:
        health.last_success_at = last_success.checked_at
    if last_failure:
        health.last_failure_at = last_failure.checked_at
        health.last_error_class = last_failure.error_class
        health.last_error_message = (last_failure.error_message or "")[:1000]
    health.consecutive_failures = consecutive
    health.avg_latency_ms_5m = avg_latency
    health.p95_latency_ms_5m = p95_latency
    health.error_rate_5m = round(error_rate, 4)
    health.parser_drift_detected = parser_drift
    health.save()
    return health


def _percentile(values: list[int], p: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, int(round(p * (len(ordered) - 1)))))
    return ordered[idx]


def _detect_parser_drift(logs: list[SourceHealthLog]) -> bool:
    """Heurística: probes recentes que voltaram HTTP 200 mas extraíram 0 itens.

    Quando o site muda o HTML, o scraper continua "respondendo OK" porém a
    contagem de itens vai a zero. Esse é o sinal mais útil em scrapers.
    """
    relevant = [
        log for log in logs
        if log.origin == SourceHealthLog.ORIGIN_PROBE
        and log.success
        and log.extracted_count is not None
    ]
    if len(relevant) < 2:
        return False
    return all(log.extracted_count == 0 for log in relevant[:3])
