"""User-scoped endpoints: profile, favorites, reading lists, progress."""

from __future__ import annotations

from django.db.models import Max
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
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
)
from .serializers import (
    FavoriteSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    ReadingListItemSerializer,
    ReadingListSerializer,
    ReadingProgressSerializer,
)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_me(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return Response(ProfileSerializer(profile).data)

    serializer = ProfileUpdateSerializer(profile, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(ProfileSerializer(profile).data)


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

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="check")
    def check(self, request):
        """``GET /favorites/check/?manga_id=<id>``

        Resposta inclui ``favorite_id`` e ``notify_on_new_chapter`` quando
        favoritado, pra UI conseguir PATCHar a preferencia sem nova lookup.
        """
        manga_id = request.query_params.get("manga_id")
        if not manga_id:
            return Response({"error": "manga_id é obrigatório"}, status=400)
        fav = (
            Favorite.objects.filter(user=request.user, manga_id=manga_id)
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
        """``DELETE /favorites/by-manga/<manga_id>/`` to unfavorite without listing."""
        deleted, _ = Favorite.objects.filter(user=request.user, manga_id=manga_id).delete()
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
        reading_list = self.get_object()
        serializer = ReadingListItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        manga = serializer.validated_data["manga"]
        item, created = ReadingListItem.objects.get_or_create(
            reading_list=reading_list,
            manga=manga,
            defaults={"position": serializer.validated_data.get("position", 0)},
        )
        if not created:
            return Response(
                {"detail": "Mangá já está nesta lista."},
                status=status.HTTP_200_OK,
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
        reading_list = self.get_object()
        deleted, _ = ReadingListItem.objects.filter(
            reading_list=reading_list, manga_id=manga_id
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Reading Progress
# ---------------------------------------------------------------------------
class ReadingProgressViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingProgressSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            ReadingProgress.objects.filter(user=self.request.user)
            .select_related("chapter__manga")
        )

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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def library_overview(request):
    favorites = (
        Favorite.objects.filter(user=request.user)
        .select_related("manga")
        .prefetch_related("manga__categories")[:20]
    )
    favorite_mangas = [fav.manga for fav in favorites]

    progress = (
        ReadingProgress.objects.filter(user=request.user, completed=False)
        .select_related("chapter__manga")
        .order_by("-updated_at")[:10]
    )

    lists = ReadingList.objects.filter(user=request.user).order_by("-updated_at")[:20]

    return Response(
        {
            "favorites": MangaListSerializer(favorite_mangas, many=True).data,
            "in_progress": ReadingProgressSerializer(progress, many=True).data,
            "lists": ReadingListSerializer(lists, many=True).data,
        }
    )
