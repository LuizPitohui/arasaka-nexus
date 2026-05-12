from rest_framework import serializers

from .models import Category, Chapter, ChapterImage, Manga


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class ChapterImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChapterImage
        fields = ["id", "image", "order"]


class ChapterListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chapter
        fields = ["id", "mangadex_id", "number", "title", "translated_language", "release_date"]


class ChapterDetailSerializer(serializers.ModelSerializer):
    images = ChapterImageSerializer(many=True, read_only=True)

    class Meta:
        model = Chapter
        fields = [
            "id",
            "mangadex_id",
            "manga",
            "number",
            "title",
            "translated_language",
            "release_date",
            "images",
        ]


class MangaListSerializer(serializers.ModelSerializer):
    """Lightweight payload for list endpoints (search, home, listings)."""

    categories = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    work_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Manga
        fields = [
            "id",
            "mangadex_id",
            "source_id",
            "title",
            "cover",
            "status",
            "content_rating",
            "is_active",
            "categories",
            "work_id",
        ]

    def get_categories(self, obj: Manga) -> list[str]:
        return [c.name for c in obj.categories.all()[:5]]

    def get_cover(self, obj: Manga) -> str:
        return obj.cover_url


class MangaDetailSerializer(serializers.ModelSerializer):
    categories = CategorySerializer(many=True, read_only=True)
    chapter_count = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    work_id = serializers.IntegerField(read_only=True, allow_null=True)
    work_sources = serializers.SerializerMethodField()

    class Meta:
        model = Manga
        fields = [
            "id",
            "mangadex_id",
            "source_id",
            "title",
            "alternative_title",
            "description",
            "cover",
            "author",
            "status",
            "content_rating",
            "is_active",
            "created_at",
            "categories",
            "chapter_count",
            "work_id",
            "work_sources",
        ]

    def get_chapter_count(self, obj: Manga) -> int:
        return obj.chapters.count()

    def get_cover(self, obj: Manga) -> str:
        return obj.cover_url

    def get_work_sources(self, obj: Manga) -> list[dict]:
        """Variantes da mesma Work (incluindo o próprio Manga). Permite
        à UI montar o switcher de fonte sem nova round-trip. Vazio quando
        o Manga não está vinculado a uma Work (caso de borda).
        """
        if not obj.work_id:
            return []
        from django.db.models import Count, Max

        siblings = (
            Manga.objects.filter(work_id=obj.work_id, is_active=True)
            .annotate(
                _chapter_count=Count("chapters", distinct=True),
                _latest_at=Max("chapters__published_at"),
            )
            .order_by("-_chapter_count", "id")
        )
        return [
            {
                "id": m.id,
                "source_id": m.source_id,
                "title": m.title,
                "chapter_count": getattr(m, "_chapter_count", 0) or 0,
                "latest_at": getattr(m, "_latest_at", None).isoformat()
                if getattr(m, "_latest_at", None)
                else None,
                "is_current": m.id == obj.id,
            }
            for m in siblings
        ]
