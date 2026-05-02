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
        """``GET /favorites/check/?manga_id=<id>`` → ``{"is_favorite": bool}``"""
        manga_id = request.query_params.get("manga_id")
        if not manga_id:
            return Response({"error": "manga_id é obrigatório"}, status=400)
        is_fav = Favorite.objects.filter(user=request.user, manga_id=manga_id).exists()
        return Response({"is_favorite": is_fav})

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
