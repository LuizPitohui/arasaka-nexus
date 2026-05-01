"""Endpoints REST para o painel admin consumir.

Permissão: IsAdminUser (only `is_staff`). Frontend deve esconder a rota
`/admin` quando `me.is_staff == false` mas a autorização real está aqui.
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from . import registry
from .models import Source, SourceHealth, SourceHealthLog
from .tasks import healthcheck_one


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_sources(request):
    """Lista fontes registradas com seu estado de saúde atual."""
    out = []
    health_map = {h.source_id: h for h in SourceHealth.objects.all()}

    enabled_ids = {s.id for s in registry.iter_active()}
    known_ids = set(registry.all_known_ids()) | enabled_ids | set(Source.objects.values_list("id", flat=True))

    for sid in sorted(known_ids):
        provider = registry.get(sid)
        row = Source.objects.filter(id=sid).first()
        h = health_map.get(sid)
        out.append({
            "id": sid,
            "name": (row.name if row else (provider.name if provider else sid)),
            "kind": (row.kind if row else (provider.kind if provider else "scraper")),
            "base_url": (row.base_url if row else (provider.base_url if provider else "")),
            "languages": (row.languages if row else (list(provider.languages) if provider else [])),
            "is_active": bool(row.is_active) if row else (sid in enabled_ids),
            "is_registered": provider is not None,
            "priority": row.priority if row else 100,
            "health": _serialize_health(h),
        })
    return Response({"results": out})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def source_detail(request, source_id: str):
    row = Source.objects.filter(id=source_id).first()
    h = SourceHealth.objects.filter(source_id=source_id).first()
    logs_qs = SourceHealthLog.objects.filter(source_id=source_id).order_by("-checked_at")[:50]
    logs = [{
        "checked_at": log.checked_at.isoformat(),
        "origin": log.origin,
        "endpoint": log.endpoint,
        "success": log.success,
        "latency_ms": log.latency_ms,
        "status_code": log.status_code,
        "error_class": log.error_class,
        "error_message": log.error_message,
        "extracted_count": log.extracted_count,
    } for log in logs_qs]

    provider = registry.get(source_id)
    return Response({
        "id": source_id,
        "name": row.name if row else (provider.name if provider else source_id),
        "base_url": row.base_url if row else (provider.base_url if provider else ""),
        "kind": row.kind if row else (provider.kind if provider else "scraper"),
        "is_active": bool(row.is_active) if row else False,
        "is_registered": provider is not None,
        "health": _serialize_health(h),
        "recent_logs": logs,
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def trigger_healthcheck(request, source_id: str):
    if registry.get(source_id) is None:
        return Response({"detail": "fonte não registrada"}, status=404)
    healthcheck_one.delay(source_id)
    return Response({"detail": "healthcheck enfileirado", "source_id": source_id, "queued_at": timezone.now().isoformat()}, status=202)


def _serialize_health(h):
    if not h:
        return {
            "status": SourceHealth.STATUS_UNKNOWN,
            "down_for_seconds": 0,
            "last_check_at": None,
            "last_success_at": None,
            "last_failure_at": None,
            "down_since": None,
            "consecutive_failures": 0,
            "avg_latency_ms_5m": 0,
            "p95_latency_ms_5m": 0,
            "error_rate_5m": 0.0,
            "last_error_class": "",
            "last_error_message": "",
            "parser_drift_detected": False,
        }
    return {
        "status": h.status,
        "down_for_seconds": h.down_for_seconds,
        "last_check_at": h.last_check_at.isoformat() if h.last_check_at else None,
        "last_success_at": h.last_success_at.isoformat() if h.last_success_at else None,
        "last_failure_at": h.last_failure_at.isoformat() if h.last_failure_at else None,
        "down_since": h.down_since.isoformat() if h.down_since else None,
        "consecutive_failures": h.consecutive_failures,
        "avg_latency_ms_5m": h.avg_latency_ms_5m,
        "p95_latency_ms_5m": h.p95_latency_ms_5m,
        "error_rate_5m": h.error_rate_5m,
        "last_error_class": h.last_error_class,
        "last_error_message": h.last_error_message,
        "parser_drift_detected": h.parser_drift_detected,
    }
