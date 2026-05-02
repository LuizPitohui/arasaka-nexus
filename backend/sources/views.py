"""Endpoints REST para o painel admin consumir.

Permissão: IsAdminUser (only `is_staff`). Frontend deve esconder a rota
`/admin` quando `me.is_staff == false` mas a autorização real está aqui.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
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


@api_view(["GET"])
@permission_classes([IsAdminUser])
def mihon_sub_sources(request):
    """Lista as extensões Mihon instaladas no Suwayomi (sub-fontes do agregador).

    Não requer healthcheck — só pergunta ao Suwayomi via /api/v1/source/list.
    Devolve sempre status 200 com `connected=False` quando o sidecar não está
    configurado, pra que o painel possa diferenciar "Mihon desligado" de
    "Mihon ligado mas sem extensões".
    """
    src = registry.get("mihon")
    if src is None:
        return Response({"connected": False, "configured": False, "sub_sources": []})
    if not getattr(src, "is_configured", False):
        return Response({"connected": False, "configured": False, "sub_sources": []})
    try:
        rows = src.list_sources_public()
    except Exception as exc:
        return Response({
            "connected": False,
            "configured": True,
            "error": str(exc)[:300],
            "sub_sources": [],
        })
    return Response({
        "connected": True,
        "configured": True,
        "sub_sources": rows,
        "count": len(rows),
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def push_metrics(request):
    """Dashboard /mikoshi/admin: agregados de Web Push.

    Inclui:
      - subs_total / subs_active_7d (last_seen_at recente)
      - users_with_push (distinct user com >=1 sub)
      - users_immediate / users_daily (Profile.digest_mode breakdown)
      - delivery_total / failure_total (sum dos contadores agregados)
      - delivery_rate (delivered / (delivered + failed))
      - top_devices por user_agent simplificado (Chrome/Firefox/Edge/etc)
      - last_delivery_at_global (mais recente de qualquer sub)
    """
    from accounts.models import Profile, PushSubscription
    from django.db.models import Count, Sum, Max

    User = get_user_model()
    last_7d = timezone.now() - timedelta(days=7)

    sub_aggs = PushSubscription.objects.aggregate(
        total=Count("id"),
        active_7d=Count("id", filter=Q(last_seen_at__gte=last_7d)),
        delivery_total=Sum("delivery_count"),
        failure_total=Sum("failure_count"),
        click_total=Sum("click_count"),
        last_delivery=Max("last_delivery_at"),
        last_click=Max("last_click_at"),
    )

    users_with_push = (
        PushSubscription.objects.values("user_id").distinct().count()
    )

    profile_modes = Profile.objects.values("digest_mode").annotate(c=Count("id"))
    digest_breakdown = {row["digest_mode"]: row["c"] for row in profile_modes}

    # Browser breakdown via heuristica simples (regex no UA). Chrome/Edge
    # compartilham token; usamos ordem mais especifica → mais geral.
    devices: dict[str, int] = {}
    for sub in PushSubscription.objects.values_list("user_agent", flat=True):
        ua = (sub or "").lower()
        if "samsungbrowser" in ua:
            key = "samsung_internet"
        elif "edg/" in ua or "edge/" in ua:
            key = "edge"
        elif "firefox" in ua:
            key = "firefox"
        elif "chrome" in ua or "chromium" in ua:
            key = "chrome"
        elif "safari" in ua:
            key = "safari"
        elif not ua:
            key = "unknown"
        else:
            key = "other"
        devices[key] = devices.get(key, 0) + 1

    delivery_total = sub_aggs["delivery_total"] or 0
    failure_total = sub_aggs["failure_total"] or 0
    click_total = sub_aggs["click_total"] or 0
    denom = delivery_total + failure_total
    delivery_rate = (delivery_total / denom) if denom else 0.0
    # Click rate: cliques / entregues. > 1.0 e possivel teoricamente
    # (user clica multiplas vezes na mesma push), mas raro — capamos em
    # 1.0 pra UI nao confundir.
    click_rate = min(click_total / delivery_total, 1.0) if delivery_total else 0.0

    return Response({
        "subscriptions": {
            "total": sub_aggs["total"] or 0,
            "active_7d": sub_aggs["active_7d"] or 0,
            "by_device": devices,
        },
        "users": {
            "total": User.objects.count(),
            "with_push": users_with_push,
            "digest_immediate": digest_breakdown.get("immediate", 0),
            "digest_daily": digest_breakdown.get("daily", 0),
        },
        "delivery": {
            "delivered_total": delivery_total,
            "failed_total": failure_total,
            "delivery_rate": round(delivery_rate, 4),
            "click_total": click_total,
            "click_rate": round(click_rate, 4),
            "last_delivery_at": (
                sub_aggs["last_delivery"].isoformat()
                if sub_aggs["last_delivery"]
                else None
            ),
            "last_click_at": (
                sub_aggs["last_click"].isoformat()
                if sub_aggs["last_click"]
                else None
            ),
        },
        "generated_at": timezone.now().isoformat(),
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def overview(request):
    """KPIs gerais do painel: contagem de fontes por status, totais, etc."""
    from employees.models import Manga, Chapter
    User = get_user_model()

    health_counts = {
        s: 0 for s in [
            SourceHealth.STATUS_UP,
            SourceHealth.STATUS_DEGRADED,
            SourceHealth.STATUS_DOWN,
            SourceHealth.STATUS_UNKNOWN,
        ]
    }
    for row in SourceHealth.objects.values("status").annotate(c=Count("source_id")):
        health_counts[row["status"]] = row["c"]

    enabled_count = sum(1 for _ in registry.iter_active())
    known_count = len(registry.all_known_ids())

    last_24h = timezone.now() - timedelta(hours=24)
    # Combina total + falhas em um só roundtrip via aggregate condicional.
    totals_24h = SourceHealthLog.objects.filter(checked_at__gte=last_24h).aggregate(
        total=Count("id"),
        failures=Count("id", filter=Q(success=False)),
    )
    log_total = totals_24h["total"] or 0
    log_failures = totals_24h["failures"] or 0
    error_rate_24h = (log_failures / log_total) if log_total else 0.0

    # Visão por fonte com saúde + sparkline.
    # Fetch unico de Source + SourceHealth (1 query via dict-map de healths)
    # e por fonte uma query indexada de 20 latências. O index existente
    # ("source", "-checked_at") garante que cada lookup é O(log n) + 20 rows.
    sources = list(Source.objects.all().order_by("priority", "name"))
    healths_map = {h.source_id: h for h in SourceHealth.objects.all()}

    sources_summary = []
    for src in sources:
        health = healths_map.get(src.id)
        recent_latencies = list(
            SourceHealthLog.objects.filter(source_id=src.id)
            .order_by("-checked_at")
            .values_list("latency_ms", flat=True)[:20]
        )
        sources_summary.append({
            "id": src.id,
            "name": src.name,
            "status": health.status if health else "UNKNOWN",
            "down_for_seconds": health.down_for_seconds if health else 0,
            "latency_avg_ms": health.avg_latency_ms_5m if health else 0,
            "error_rate_5m": health.error_rate_5m if health else 0.0,
            "sparkline": list(reversed(recent_latencies)),  # antigo → novo
        })

    # Activity feed: últimas 15 entradas (qualquer fonte/origem)
    recent_activity = [
        {
            "checked_at": log.checked_at.isoformat(),
            "source_id": log.source_id,
            "endpoint": log.endpoint,
            "origin": log.origin,
            "success": log.success,
            "latency_ms": log.latency_ms,
            "status_code": log.status_code,
            "error_class": log.error_class,
        }
        for log in SourceHealthLog.objects.select_related("source")
        .order_by("-checked_at")[:15]
    ]

    return Response({
        "sources": {
            "enabled": enabled_count,
            "known": known_count,
            "by_status": health_counts,
            "summary": sources_summary,
        },
        "library": {
            "mangas": Manga.objects.count(),
            "chapters": Chapter.objects.count(),
        },
        "users": {
            "total": User.objects.count(),
            "staff": User.objects.filter(is_staff=True).count(),
        },
        "telemetry_24h": {
            "total_requests": log_total,
            "failures": log_failures,
            "error_rate": round(error_rate_24h, 4),
        },
        "recent_activity": recent_activity,
        "generated_at": timezone.now().isoformat(),
    })


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
