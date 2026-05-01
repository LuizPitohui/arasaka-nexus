"""Tasks Celery do app sources.

Por enquanto temos apenas o ciclo de saúde:

  - `sources.healthcheck_all` (Celery beat a cada minuto): seleciona fontes
    cuja última checagem está vencida e enfileira `sources.healthcheck_one`.
  - `sources.healthcheck_one`: roda o probe de uma fonte específica e recalcula
    o resumo `SourceHealth`.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from . import registry
from .base.health import recompute_health
from .models import Source, SourceHealth, SourceHealthLog

logger = logging.getLogger(__name__)


@shared_task(name="sources.healthcheck_all")
def healthcheck_all() -> dict:
    """Itera fontes ativas e despacha probes para as que estão vencidas."""
    interval = int(getattr(settings, "SOURCES_HEALTHCHECK_INTERVAL_SECONDS", 300))
    cutoff = timezone.now() - timedelta(seconds=interval)
    dispatched: list[str] = []

    enabled_ids = {src.id for src in registry.iter_active()}
    for sid in enabled_ids:
        # Garante que existe a linha em Source para que SourceHealth seja criada.
        Source.objects.get_or_create(
            id=sid,
            defaults=_default_source_row(sid),
        )
        health = SourceHealth.objects.filter(source_id=sid).first()
        if health and health.last_check_at and health.last_check_at > cutoff:
            continue
        healthcheck_one.delay(sid)
        dispatched.append(sid)

    return {"dispatched": dispatched, "checked_at": timezone.now().isoformat()}


@shared_task(name="sources.healthcheck_one")
def healthcheck_one(source_id: str) -> dict:
    source = registry.get(source_id)
    if source is None:
        logger.warning("healthcheck_one: source %s não encontrado no registry", source_id)
        return {"source_id": source_id, "skipped": "not-in-registry"}

    Source.objects.get_or_create(id=source_id, defaults=_default_source_row(source_id))

    try:
        result = source.healthcheck()
    except Exception as exc:  # pragma: no cover — defesa em profundidade
        logger.exception("healthcheck %s explodiu", source_id)
        SourceHealthLog.objects.create(
            source_id=source_id,
            origin=SourceHealthLog.ORIGIN_PROBE,
            endpoint="healthcheck",
            success=False,
            latency_ms=0,
            error_class=exc.__class__.__name__,
            error_message=str(exc)[:500],
            extracted_count=0,
        )
    else:
        SourceHealthLog.objects.create(
            source_id=source_id,
            origin=SourceHealthLog.ORIGIN_PROBE,
            endpoint="healthcheck",
            success=result.success,
            latency_ms=result.latency_ms,
            status_code=result.status_code,
            error_class=result.error_class,
            error_message=result.error_message,
            extracted_count=result.extracted_count,
        )

    health = recompute_health(Source.objects.get(id=source_id))
    return {
        "source_id": source_id,
        "status": health.status,
        "consecutive_failures": health.consecutive_failures,
        "error_rate_5m": health.error_rate_5m,
    }


def _default_source_row(source_id: str) -> dict:
    """Inicializa metadados de Source quando criado on-the-fly pela task."""
    src = registry.get(source_id)
    if not src:
        return {"name": source_id, "base_url": "", "languages": []}
    return {
        "name": src.name,
        "base_url": src.base_url,
        "languages": list(src.languages),
        "kind": src.kind,
        "is_active": True,
    }
