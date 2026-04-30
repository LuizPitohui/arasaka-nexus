"""HTTP views.

The HTTP layer never blocks waiting for MangaDex. Anything that requires an
upstream call gets dispatched to Celery; reads served to the user are backed
by the local database (with the rate-limited reader endpoint cached in Redis
inside the client).
"""

from __future__ import annotations

import logging

from django.core.cache import cache
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

# Cache key for individual manga detail responses; short TTL since chapter
# count changes when feeds sync.
MANGA_DETAIL_CACHE_TTL = 60
MANGA_DETAIL_CACHE_KEY = "manga:detail:{id}"


class SearchThrottle(UserRateThrottle):
    """Throttles ``search`` reading the rate from ``DEFAULT_THROTTLE_RATES['search']``."""

    scope = "search"


class ImportThrottle(UserRateThrottle):
    scope = "import"

from .models import Category, Chapter, ChapterImage, Manga
from .serializers import (
    CategorySerializer,
    ChapterDetailSerializer,
    ChapterImageSerializer,
    ChapterListSerializer,
    MangaDetailSerializer,
    MangaListSerializer,
)
from .services import MangaDexScanner, get_mangadex_pages
from .tasks import task_import_manga_chapters, task_seed_initial_library

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# ViewSets
# ----------------------------------------------------------------------
class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def with_counts(self, request):
        """Returns every category annotated with how many active mangás use it."""
        cats = (
            Category.objects.annotate(
                manga_count=Count("mangas", filter=Q(mangas__is_active=True), distinct=True)
            )
            .filter(manga_count__gt=0)
            .order_by("-manga_count", "name")
        )
        data = [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "manga_count": c.manga_count,
            }
            for c in cats
        ]
        return Response(data)


VALID_ORDERINGS = {
    "recent": "-id",
    "alphabetical": "title",
    "alphabetical_desc": "-title",
    "popular": "-favorites_count",
    "latest_chapter": "-latest_chapter_at",
    "oldest": "id",
}


class MangaViewSet(viewsets.ModelViewSet):
    queryset = Manga.objects.filter(is_active=True).prefetch_related("categories").order_by("-id")
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.action == "list":
            return MangaListSerializer
        return MangaDetailSerializer

    def retrieve(self, request, *args, **kwargs):
        # Short cache (60s) — cuts repeated detail loads when a user opens
        # several chapters in a row from the same page.
        pk = kwargs.get("pk")
        cache_key = MANGA_DETAIL_CACHE_KEY.format(id=pk)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, MANGA_DETAIL_CACHE_TTL)
        return response

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.delete(MANGA_DETAIL_CACHE_KEY.format(id=serializer.instance.id))

    def perform_destroy(self, instance):
        cache.delete(MANGA_DETAIL_CACHE_KEY.format(id=instance.id))
        super().perform_destroy(instance)

    def get_queryset(self):
        qs = Manga.objects.filter(is_active=True).prefetch_related("categories")

        params = self.request.query_params

        genres = params.getlist("genre")
        if genres:
            for slug in genres:
                qs = qs.filter(categories__slug=slug)
            qs = qs.distinct()

        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())

        title = params.get("title")
        if title:
            qs = qs.filter(title__icontains=title)

        # Annotations only when needed
        ordering = params.get("ordering", "recent")
        if ordering in {"popular"}:
            qs = qs.annotate(favorites_count=Count("favorited_by", distinct=True))
        if ordering in {"latest_chapter"}:
            qs = qs.annotate(latest_chapter_at=Max("chapters__release_date"))

        order_expr = VALID_ORDERINGS.get(ordering, "-id")
        return qs.order_by(order_expr)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def popular(self, request):
        qs = (
            Manga.objects.filter(is_active=True)
            .annotate(favorites_count=Count("favorited_by", distinct=True))
            .prefetch_related("categories")
            .order_by("-favorites_count", "-id")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = MangaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(MangaListSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def latest(self, request):
        qs = (
            Manga.objects.filter(is_active=True)
            .annotate(latest_chapter_at=Max("chapters__release_date"))
            .filter(latest_chapter_at__isnull=False)
            .prefetch_related("categories")
            .order_by("-latest_chapter_at")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = MangaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(MangaListSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def random(self, request):
        manga = (
            Manga.objects.filter(is_active=True)
            .order_by("?")
            .first()
        )
        if not manga:
            return Response({"detail": "Sem mangás disponíveis."}, status=404)
        return Response(MangaDetailSerializer(manga).data)


class ChapterViewSet(viewsets.ModelViewSet):
    queryset = Chapter.objects.all().select_related("manga").order_by("-number")
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ChapterDetailSerializer
        return ChapterListSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        manga_id = self.request.query_params.get("manga")
        if manga_id is not None:
            queryset = queryset.filter(manga_id=manga_id)
        return queryset


# ----------------------------------------------------------------------
# Reader (chapter pages + navigation)
# ----------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def get_chapter_pages(request, chapter_id: int):
    chapter = get_object_or_404(Chapter, id=chapter_id)

    siblings = list(
        Chapter.objects.filter(manga_id=chapter.manga_id)
        .order_by("number")
        .values_list("id", flat=True)
    )
    try:
        idx = siblings.index(chapter.id)
    except ValueError:
        idx = 0
    prev_chapter_id = siblings[idx - 1] if idx > 0 else None
    next_chapter_id = siblings[idx + 1] if idx < len(siblings) - 1 else None

    pages: list = []
    source = "LOCAL"
    local_images = ChapterImage.objects.filter(chapter=chapter).order_by("order")
    if local_images.exists():
        pages = ChapterImageSerializer(local_images, many=True).data
    elif chapter.mangadex_id:
        source = "MANGADEX_STREAM"
        pages = get_mangadex_pages(chapter.mangadex_id)

    return Response(
        {
            "source": source,
            "manga_id": chapter.manga_id,
            "manga_title": chapter.manga.title,
            "chapter_number": chapter.number,
            "title": chapter.title,
            "pages": pages,
            "navigation": {"prev": prev_chapter_id, "next": next_chapter_id},
        }
    )


# ----------------------------------------------------------------------
# Search (hybrid: local + MangaDex)
# ----------------------------------------------------------------------
# Local catalogue is queried first; only when it has fewer than this many hits
# do we fan out to MangaDex (which has a tight 30/min budget shared across users).
LOCAL_FIRST_THRESHOLD = 8
LOCAL_LIMIT = 12


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([SearchThrottle])
def search_mangas(request):
    query = (request.query_params.get("q") or "").strip()
    if not query:
        return Response([])

    local_qs = list(
        Manga.objects.filter(title__icontains=query, is_active=True)
        .order_by("-id")[:LOCAL_LIMIT]
    )
    seen_dex_ids: set[str] = {m.mangadex_id for m in local_qs if m.mangadex_id}

    results = [
        {
            "id": m.id,
            "title": m.title,
            "cover": m.cover_url,
            "mangadex_id": m.mangadex_id,
            "in_library": True,
        }
        for m in local_qs
    ]

    # Only consult MangaDex when the local catalogue is weak — keeps the
    # upstream search budget free for genuinely unknown titles.
    if len(query) > 2 and len(local_qs) < LOCAL_FIRST_THRESHOLD:
        scanner = MangaDexScanner()
        for ext in scanner.search_manga(query):
            dex_id = ext.get("mangadex_id")
            if not dex_id or dex_id in seen_dex_ids:
                continue
            results.append(
                {
                    "id": dex_id,
                    "title": ext["title"],
                    "cover": ext["cover"],
                    "mangadex_id": dex_id,
                    "in_library": False,
                    "description": ext.get("description") or "",
                    "status": ext.get("status") or "UNKNOWN",
                }
            )

    return Response(results)


# ----------------------------------------------------------------------
# Async import (dispatches Celery task)
# ----------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ImportThrottle])
def import_manga(request):
    dex_id = (request.data or {}).get("mangadex_id")
    if not dex_id:
        return Response(
            {"error": "mangadex_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST
        )

    existing = Manga.objects.filter(mangadex_id=dex_id).first()
    task = task_import_manga_chapters.delay(dex_id)

    return Response(
        {
            "status": "processing",
            "task_id": task.id,
            "message": (
                "Mangá já existe. Atualização agendada."
                if existing
                else "Importação iniciada em background."
            ),
            "manga_id": existing.id if existing else None,
            "created": existing is None,
        },
        status=status.HTTP_202_ACCEPTED,
    )


# ----------------------------------------------------------------------
# Home (vitrine) — never blocks on MangaDex
# ----------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def home_content(request):
    """Return featured + recent mangás. Never makes upstream calls.

    The first time the database is empty, we *dispatch* a background task to
    seed the library — the response just signals ``seeding=True`` so the UI
    can show a loading state.
    """
    total = Manga.objects.filter(is_active=True).count()
    seeding = False
    if total < 5:
        # Fire-and-forget; the task itself uses a Redis lock to avoid duplicates.
        task_seed_initial_library.delay()
        seeding = True

    base_qs = (
        Manga.objects.filter(is_active=True)
        .prefetch_related("categories")
    )

    featured = list(base_qs.order_by("-id")[:10])
    recent = list(base_qs.order_by("-created_at")[:10])

    return Response(
        {
            "seeding": seeding,
            "total": total,
            "featured": [
                {
                    "id": m.id,
                    "title": m.title,
                    "cover": m.cover_url,
                    "categories": [c.name for c in m.categories.all()[:3]],
                }
                for m in featured
            ],
            "recent": [
                {
                    "id": m.id,
                    "title": m.title,
                    "cover": m.cover_url,
                    "status": m.status,
                }
                for m in recent
            ],
        }
    )
