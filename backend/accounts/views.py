"""User-scoped endpoints: profile, favorites, reading lists, progress."""

from __future__ import annotations

from django.db.models import Count, F, Max
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from employees.serializers import MangaListSerializer

from .models import (
    Favorite,
    Profile,
    PushSubscription,
    ReadingList,
    ReadingListItem,
    ReadingProgress,
    Season,
    UserSeasonStats,
)
from .ranking import RANKS
from .serializers import (
    FavoriteSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    ReadingListItemSerializer,
    ReadingListSerializer,
    ReadingProgressSerializer,
    SeasonSerializer,
    UserRankSerializer,
    _rank_payload,
)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_me(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return Response(ProfileSerializer(profile, context={"request": request}).data)

    serializer = ProfileUpdateSerializer(profile, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(ProfileSerializer(profile, context={"request": request}).data)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def profile_avatar(request):
    """Upload (POST multipart com campo `avatar`) ou remoção (DELETE) do
    avatar do user autenticado. Limite 2 MB; aceita JPEG/PNG/WEBP/GIF.
    """
    profile, _ = Profile.objects.get_or_create(user=request.user)

    if request.method == "DELETE":
        if profile.avatar:
            profile.avatar.delete(save=False)
            profile.avatar = None
            profile.save(update_fields=["avatar", "updated_at"])
        return Response(
            ProfileSerializer(profile, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    if "avatar" not in request.FILES:
        return Response(
            {"avatar": ["Arquivo não enviado."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = ProfileUpdateSerializer(
        profile,
        data={"avatar": request.FILES["avatar"]},
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    # Substitui o avatar antigo no disco pra não acumular órfãos.
    if profile.avatar:
        profile.avatar.delete(save=False)
    serializer.save()
    return Response(
        ProfileSerializer(profile, context={"request": request}).data,
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Work-aware helpers
# ---------------------------------------------------------------------------
def _work_sibling_manga_ids(manga_id) -> list[int]:
    """Devolve IDs de TODAS as variantes do Work do ``manga_id``.

    Se o manga não tem ``work_id`` (importação sem matcher canônico),
    devolve só ``[manga_id]``. Quando tem Work, devolve todas as
    variantes — usado pra unificar favoritar/listar/progresso entre
    fontes diferentes do mesmo mangá ("Solo Leveling" MangaDex + Mihon +
    MangaPlus passam a contar como o mesmo).
    """
    from employees.models import Manga

    try:
        manga_id = int(manga_id)
    except (TypeError, ValueError):
        return []
    target = Manga.objects.filter(id=manga_id).only("id", "work_id").first()
    if not target:
        return []
    if not target.work_id:
        return [target.id]
    return list(
        Manga.objects.filter(work_id=target.work_id).values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------
class FavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Favorite.objects.filter(user=self.request.user)
            .select_related("manga")
            .prefetch_related("manga__categories")
        )

    def create(self, request, *args, **kwargs):
        """POST /favorites/  body: {"manga_id": X}

        Idempotente em nivel de Work: se ja existe Favorite do user pra
        qualquer variante do mesmo Work, devolve essa (200) em vez de
        criar duplicata.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        manga = serializer.validated_data.get("manga")
        sibling_ids = _work_sibling_manga_ids(manga.id) if manga else []
        existing = (
            Favorite.objects.filter(user=request.user, manga_id__in=sibling_ids)
            .select_related("manga")
            .prefetch_related("manga__categories")
            .first()
            if sibling_ids
            else None
        )
        if existing:
            return Response(
                FavoriteSerializer(existing, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="check")
    def check(self, request):
        """``GET /favorites/check/?manga_id=<id>``

        Resposta inclui ``favorite_id`` e ``notify_on_new_chapter`` quando
        favoritado. Olha tambem as variantes do mesmo Work — favoritar uma
        variante reflete em todas.
        """
        manga_id = request.query_params.get("manga_id")
        if not manga_id:
            return Response({"error": "manga_id é obrigatório"}, status=400)
        sibling_ids = _work_sibling_manga_ids(manga_id)
        if not sibling_ids:
            return Response({"is_favorite": False})
        fav = (
            Favorite.objects.filter(user=request.user, manga_id__in=sibling_ids)
            .only("id", "notify_on_new_chapter")
            .first()
        )
        if not fav:
            return Response({"is_favorite": False})
        return Response(
            {
                "is_favorite": True,
                "favorite_id": fav.id,
                "notify_on_new_chapter": fav.notify_on_new_chapter,
            }
        )

    @action(detail=False, methods=["delete"], url_path="by-manga/(?P<manga_id>[^/.]+)")
    def by_manga(self, request, manga_id=None):
        """``DELETE /favorites/by-manga/<manga_id>/`` — desfavorita qualquer
        variante do mesmo Work (UI nao precisa saber qual manga_id armazenado).
        """
        sibling_ids = _work_sibling_manga_ids(manga_id) or [manga_id]
        deleted, _ = Favorite.objects.filter(
            user=request.user, manga_id__in=sibling_ids
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Reading Lists
# ---------------------------------------------------------------------------
class ReadingListViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            ReadingList.objects.filter(user=self.request.user)
            .prefetch_related("items__manga__categories")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="add")
    def add_manga(self, request, pk=None):
        """Adiciona mangá à lista. Idempotente em nivel de Work — se qualquer
        variante do mesmo Work ja esta na lista, devolve o item existente.
        """
        reading_list = self.get_object()
        serializer = ReadingListItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        manga = serializer.validated_data["manga"]
        sibling_ids = _work_sibling_manga_ids(manga.id)
        existing = (
            ReadingListItem.objects.filter(
                reading_list=reading_list, manga_id__in=sibling_ids
            )
            .select_related("manga")
            .first()
            if sibling_ids
            else None
        )
        if existing:
            return Response(
                ReadingListItemSerializer(existing).data,
                status=status.HTTP_200_OK,
            )
        item = ReadingListItem.objects.create(
            reading_list=reading_list,
            manga=manga,
            position=serializer.validated_data.get("position", 0),
        )
        return Response(
            ReadingListItemSerializer(item).data, status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path="items/(?P<manga_id>[^/.]+)",
    )
    def remove_manga(self, request, pk=None, manga_id=None):
        """Remove qualquer variante do Work do ``manga_id`` da lista — UI
        nao precisa lembrar qual variante o item esta armazenado."""
        reading_list = self.get_object()
        sibling_ids = _work_sibling_manga_ids(manga_id) or [manga_id]
        deleted, _ = ReadingListItem.objects.filter(
            reading_list=reading_list, manga_id__in=sibling_ids
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="contains")
    def contains(self, request, pk=None):
        """``GET /lists/<id>/contains/?manga_id=<x>`` — verifica se algum
        item da lista pertence ao mesmo Work do ``manga_id``. Frontend
        usa pra mostrar "+ Adicionar" vs "✓ Na lista" em cards de variante.
        """
        reading_list = self.get_object()
        manga_id = request.query_params.get("manga_id")
        if not manga_id:
            return Response({"error": "manga_id é obrigatório"}, status=400)
        sibling_ids = _work_sibling_manga_ids(manga_id)
        if not sibling_ids:
            return Response({"contains": False})
        item = (
            ReadingListItem.objects.filter(
                reading_list=reading_list, manga_id__in=sibling_ids
            )
            .only("id", "manga_id")
            .first()
        )
        if not item:
            return Response({"contains": False})
        return Response({"contains": True, "item_id": item.id, "manga_id": item.manga_id})


# ---------------------------------------------------------------------------
# Reading Progress
# ---------------------------------------------------------------------------
class ReadingProgressViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingProgressSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = (
            ReadingProgress.objects.filter(user=self.request.user)
            .select_related("chapter__manga")
        )
        # Filtro por mangá (?manga=<id>) — usado pela página de detalhe pra
        # carregar de uma vez o estado de leitura de todos os capítulos e
        # marcar os já lidos no chapter list. Expande pra variantes do
        # mesmo Work (status de leitura compartilhado entre fontes).
        manga_id = self.request.query_params.get("manga")
        if manga_id:
            sibling_ids = _work_sibling_manga_ids(manga_id) or [manga_id]
            qs = qs.filter(chapter__manga_id__in=sibling_ids)
        return qs

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_set(self, request):
        """Marca/desmarca vários capítulos de uma vez.

        Body: ``{"chapter_ids": [1,2,3], "completed": true}``

        Útil pra ações tipo "marcar todos os anteriores como lidos" sem
        precisar de N requests separados.
        """
        chapter_ids = request.data.get("chapter_ids") or []
        completed = bool(request.data.get("completed", True))
        if not isinstance(chapter_ids, list) or not chapter_ids:
            return Response(
                {"error": "chapter_ids deve ser uma lista nao vazia"},
                status=400,
            )
        # Limita pra evitar abuso (UI raramente precisa de mais).
        chapter_ids = [int(c) for c in chapter_ids[:500] if str(c).isdigit()]
        from employees.models import Chapter

        valid_ids = set(
            Chapter.objects.filter(id__in=chapter_ids).values_list("id", flat=True)
        )
        results = []
        for cid in chapter_ids:
            if cid not in valid_ids:
                continue
            progress, _ = ReadingProgress.objects.update_or_create(
                user=request.user,
                chapter_id=cid,
                defaults={"completed": completed},
            )
            results.append(progress.id)
        return Response({"updated": len(results)}, status=200)

    def create(self, request, *args, **kwargs):
        """Upsert by (user, chapter)."""
        chapter_id = request.data.get("chapter") or request.data.get("chapter_id")
        if not chapter_id:
            return Response({"error": "chapter é obrigatório"}, status=400)

        page_number = int(request.data.get("page_number", 0) or 0)
        completed = bool(request.data.get("completed", False))

        progress, _ = ReadingProgress.objects.update_or_create(
            user=request.user,
            chapter_id=chapter_id,
            defaults={"page_number": page_number, "completed": completed},
        )
        return Response(ReadingProgressSerializer(progress).data, status=200)

    @action(detail=False, methods=["get"], url_path="continue")
    def continue_reading(self, request):
        """Latest in-progress chapter per manga (limit 10)."""
        # Get the latest progress per manga for this user.
        latest_per_manga = (
            ReadingProgress.objects.filter(user=request.user, completed=False)
            .values("chapter__manga_id")
            .annotate(latest_id=Max("id"))
            .order_by("-latest_id")[:10]
        )
        ids = [row["latest_id"] for row in latest_per_manga]
        progresses = (
            ReadingProgress.objects.filter(id__in=ids)
            .select_related("chapter__manga")
            .order_by("-updated_at")
        )
        return Response(ReadingProgressSerializer(progresses, many=True).data)


# ---------------------------------------------------------------------------
# Convenience: user's library overview (favorites + recent progress)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Library badge (count de capitulos novos nao-lidos pra app icon badge)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def library_unread_count(request):
    """Quantidade de capitulos nao-lidos de mangas favoritados (cap em 99).

    Definicao de "nao-lido":
      - manga favoritado pelo user com notify_on_new_chapter=True
      - capitulo release_date nas ultimas 14 dias (nao mostra residuo
        antigo de quando o user favoritou e nunca leu nada)
      - sem ReadingProgress do user pra esse capitulo

    Cap em 99: a Badging API trata > 99 com '99+' visualmente nos
    launchers. Acima disso e desperdicio de query.
    """
    from datetime import timedelta

    from django.utils import timezone

    from employees.models import Chapter

    cutoff = timezone.now() - timedelta(days=14)

    unread = (
        Chapter.objects.filter(
            manga__favorited_by__user=request.user,
            manga__favorited_by__notify_on_new_chapter=True,
            release_date__gte=cutoff,
        )
        .exclude(reading_progress_entries__user=request.user)
        .distinct()
        .count()
    )
    return Response({"unread": min(unread, 99)})


# ---------------------------------------------------------------------------
# Web Push subscriptions (notificacoes de capitulo novo)
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    """Registra (ou atualiza) uma subscription do navegador atual.

    Body esperado (formato vindo de pushManager.subscribe().toJSON()):
      {
        "endpoint": "...",
        "keys": {"p256dh": "...", "auth": "..."}
      }

    Quando o endpoint ja existe (mesmo dispositivo, re-subscribe), faz
    update mantendo o id antigo.
    """
    data = request.data or {}
    endpoint = data.get("endpoint") or ""
    keys = data.get("keys") or {}
    p256dh = keys.get("p256dh") or ""
    auth = keys.get("auth") or ""

    if not (endpoint and p256dh and auth):
        return Response(
            {"error": "endpoint, keys.p256dh e keys.auth sao obrigatorios"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:255]

    sub, created = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            "user": request.user,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
        },
    )
    return Response(
        {"id": sub.id, "created": created},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    """Remove a subscription do endpoint informado (mesmo formato do subscribe)."""
    endpoint = (request.data or {}).get("endpoint") or ""
    if not endpoint:
        return Response(
            {"error": "endpoint e obrigatorio"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    deleted, _ = PushSubscription.objects.filter(
        user=request.user, endpoint=endpoint
    ).delete()
    return Response({"deleted": deleted}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def push_status(request):
    """Status do push pra esse user. Devolve count de subs ativas."""
    count = PushSubscription.objects.filter(user=request.user).count()
    return Response({"subscriptions": count})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def push_clicked(request):
    """SW notificationclick aciona aqui pra contabilizar engagement.

    Anonimo (SW pode nao ter cookie de auth disponivel; fetch credentials
    dependem da implementacao do SW). Pra evitar inflar metricas com
    spam, so contamos quando o endpoint informado existe na nossa base —
    spam de endpoints aleatorios nao bumpa nada.

    Throttle: AnonRateThrottle padrao (200/min) cobre.
    """
    from django.db.models import F
    from django.utils import timezone

    endpoint = (request.data or {}).get("endpoint") or ""
    if not endpoint or not endpoint.startswith("https://"):
        return Response({"counted": False}, status=status.HTTP_200_OK)

    updated = PushSubscription.objects.filter(endpoint=endpoint).update(
        click_count=F("click_count") + 1,
        last_click_at=timezone.now(),
    )
    return Response({"counted": bool(updated)}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_test(request):
    """Manda 1 push de teste pro proprio user (todas as subs).

    Util pro user confirmar que ativacao funcionou sem esperar capitulo
    novo. Devolve {delivered: N} — 0 indica falha (VAPID nao configurada,
    permissao revogada no browser, endpoint expirado, etc).
    """
    from .push import is_configured, send_to_user

    if not is_configured():
        return Response(
            {"error": "push-not-configured"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    delivered = send_to_user(
        request.user,
        title="Arasaka Nexus",
        body="Notificacoes funcionando. Voce vai receber capitulos novos por aqui.",
        url="/profile",
        tag="push-test",
    )
    return Response(
        {"delivered": delivered},
        status=status.HTTP_200_OK if delivered else status.HTTP_502_BAD_GATEWAY,
    )


# ---------------------------------------------------------------------------
# Ranking competitivo
# ---------------------------------------------------------------------------
def _compute_live_position_and_tier(stats, season) -> tuple[int | None, int]:
    """Calcula posição e tier AO VIVO, sem esperar o recompute diário.

    Tier vem do SCORE absoluto (modelo threshold-based — user solo consegue
    promover acumulando pontos, não depende de outros agentes). Position
    vem da contagem de scores maiores na season (competição pela ordem
    dentro do tier e no leaderboard global).
    """
    from .ranking import rank_for_score

    tier = rank_for_score(stats.score).tier
    if stats.score <= 0:
        return None, tier

    higher = UserSeasonStats.objects.filter(
        season=season, score__gt=stats.score
    ).count()
    return higher + 1, tier


def _compute_progress_to_next(stats, season, current_tier: int) -> dict | None:
    """Calcula quanto falta pro próximo tier (threshold absoluto).

    Tiers são definidos por ``min_score`` em ``ranking.RANKS`` — progress
    é a fração do score atual dentro da janela ``[current.min, next.min)``.

    Devolve None se o user já está no tier máximo.
    """
    from .ranking import RANK_BY_TIER, RANKS as _RANKS

    next_tier = next(
        (r for r in sorted(_RANKS, key=lambda x: x.tier) if r.tier > current_tier),
        None,
    )
    if next_tier is None:
        return None

    current_min = RANK_BY_TIER[current_tier].min_score
    span = max(1, next_tier.min_score - current_min)
    within = max(0, stats.score - current_min)
    percent = min(100, int(round((within / span) * 100)))
    points_to_next = max(0, next_tier.min_score - stats.score)

    return {
        "next_rank": _rank_payload(next_tier.tier),
        "threshold_score": next_tier.min_score,
        "points_to_next": points_to_next,
        "percent": percent,
    }


def _compute_points_breakdown(user_id, season_id) -> dict:
    """Soma pontos por tipo (chapter / reading_time / work_complete)."""
    from django.db.models import Sum

    from .models import ScoreEvent

    rows = (
        ScoreEvent.objects.filter(user_id=user_id, season_id=season_id)
        .values("kind")
        .annotate(total=Sum("points"))
    )
    out = {kind: 0 for kind, _ in ScoreEvent.KIND_CHOICES}
    for row in rows:
        out[row["kind"]] = int(row["total"] or 0)
    return out


def _total_agents(season) -> int:
    return UserSeasonStats.objects.filter(season=season, score__gt=0).count()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rank_me(request):
    """Devolve rank + progresso + breakdown + total de agentes da season.

    Resposta enriquecida pra UI desenhar barra de progresso ao próximo tier
    e cards de breakdown por origem dos pontos.
    """
    season = Season.current()
    if season is None:
        return Response({"detail": "Nenhuma season ativa."}, status=503)

    stats, _ = UserSeasonStats.objects.select_related("user", "user__profile").get_or_create(
        user=request.user, season=season
    )
    live_position, live_tier = _compute_live_position_and_tier(stats, season)
    payload = UserRankSerializer(stats, context={"request": request}).data
    # Sobrescreve com valores ao vivo pra UX não esperar o recompute diário.
    payload["position"] = live_position
    payload["rank"] = _rank_payload(live_tier)
    if live_tier > stats.peak_rank_tier:
        payload["peak_rank"] = _rank_payload(live_tier)
    payload["progress"] = _compute_progress_to_next(stats, season, live_tier)
    payload["breakdown"] = _compute_points_breakdown(request.user.id, season.id)
    payload["total_agents"] = _total_agents(season)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    """Top N (default 100) da season ativa, ordenado por score.

    Query params:
      - ``limit``: nº de entradas (1-200, default 100)
      - ``season``: slug pra ver leaderboard de season passada
    """
    slug = request.query_params.get("season")
    if slug:
        season = Season.objects.filter(slug=slug).first()
        if not season:
            return Response({"detail": "Season não encontrada."}, status=404)
    else:
        season = Season.current()
        if season is None:
            return Response({"detail": "Nenhuma season ativa."}, status=503)

    try:
        limit = int(request.query_params.get("limit", "100"))
    except ValueError:
        limit = 100
    limit = max(1, min(limit, 200))

    qs = (
        UserSeasonStats.objects.filter(season=season, score__gt=0)
        .select_related("user", "user__profile")
        .order_by("-score", "id")[:limit]
    )
    entries = UserRankSerializer(qs, many=True, context={"request": request}).data
    # Override position pra refletir ranking ao vivo (qs ja vem ordenado por
    # -score). Tier vem do score absoluto via rank_for_score.
    from .ranking import rank_for_score

    total_agents = _total_agents(season)
    for i, entry in enumerate(entries):
        entry["position"] = i + 1
        entry["rank"] = _rank_payload(rank_for_score(entry["score"]).tier)

    me_stats = (
        UserSeasonStats.objects.filter(user=request.user, season=season)
        .select_related("user", "user__profile")
        .first()
    )
    me = None
    if me_stats:
        live_position, live_tier = _compute_live_position_and_tier(me_stats, season)
        me = UserRankSerializer(me_stats, context={"request": request}).data
        me["position"] = live_position
        me["rank"] = _rank_payload(live_tier)
        if live_tier > me_stats.peak_rank_tier:
            me["peak_rank"] = _rank_payload(live_tier)
        me["progress"] = _compute_progress_to_next(me_stats, season, live_tier)
        me["breakdown"] = _compute_points_breakdown(request.user.id, season.id)

    return Response(
        {
            "season": SeasonSerializer(season).data,
            "entries": entries,
            "me": me,
            "tiers": [_rank_payload(r.tier) for r in RANKS],
            "total_agents": total_agents,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seasons_list(request):
    """Lista todas as seasons (ativas e fechadas) com peak rank do user."""
    seasons = Season.objects.all()
    user_stats = {
        s.season_id: s
        for s in UserSeasonStats.objects.filter(user=request.user)
    }
    payload = []
    for season in seasons:
        stat = user_stats.get(season.id)
        payload.append(
            {
                **SeasonSerializer(season).data,
                "my_score": stat.score if stat else 0,
                "my_peak_rank": _rank_payload(stat.peak_rank_tier) if stat else _rank_payload(0),
                "my_final_rank": _rank_payload(stat.rank_tier) if stat else _rank_payload(0),
            }
        )
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def library_overview(request):
    # Whitelist de orderings — evita SQL injection via query param e mantém
    # o contrato estável pro frontend. Default: `updated` (cap mais recente).
    sort = (request.query_params.get("sort") or "updated").lower()

    fav_qs = (
        Favorite.objects.filter(user=request.user)
        .select_related("manga")
        .prefetch_related("manga__categories")
    )

    if sort == "added":
        fav_qs = fav_qs.order_by("-created_at", "-id")
    elif sort == "added_asc":
        fav_qs = fav_qs.order_by("created_at", "id")
    elif sort == "alpha":
        fav_qs = fav_qs.order_by("manga__title", "-id")
    elif sort == "alpha_desc":
        fav_qs = fav_qs.order_by("-manga__title", "-id")
    elif sort == "chapters":
        fav_qs = fav_qs.annotate(
            _cap_count=Count("manga__chapters", distinct=True)
        ).order_by("-_cap_count", "-created_at")
    else:
        # `updated` (default): MAX(chapter.published_at) por mangá, com
        # nulls_last pra mangás sem capítulos importados não tomarem o topo.
        sort = "updated"
        fav_qs = fav_qs.annotate(
            _latest_at=Max("manga__chapters__published_at")
        ).order_by(F("_latest_at").desc(nulls_last=True), "-created_at")

    # Limite generoso: usuário com 50 favoritos não some do Vault.
    favorites = list(fav_qs[:50])

    # Dedupe por Work canonical: se o usuário favoritou 2+ variantes da
    # mesma obra (MangaDex + Mihon, etc.), mostra UM card só. Mantém a
    # primeira variante visitada (preserva a ordem do sort acima);
    # Mangas sem work_id (NULL) ficam independentes pra não colidirem
    # entre si.
    seen_works: set[int] = set()
    deduped_mangas: list = []
    for fav in favorites:
        m = fav.manga
        if m.work_id is None:
            deduped_mangas.append(m)
            continue
        if m.work_id in seen_works:
            continue
        seen_works.add(m.work_id)
        deduped_mangas.append(m)

    favorite_mangas = deduped_mangas

    progress = (
        ReadingProgress.objects.filter(user=request.user, completed=False)
        .select_related("chapter__manga")
        .order_by("-updated_at")[:10]
    )

    lists = ReadingList.objects.filter(user=request.user).order_by("-updated_at")[:20]

    return Response(
        {
            "sort": sort,
            "favorites": MangaListSerializer(favorite_mangas, many=True).data,
            "in_progress": ReadingProgressSerializer(progress, many=True).data,
            "lists": ReadingListSerializer(lists, many=True).data,
        }
    )
