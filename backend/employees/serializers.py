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
        ]

    def get_categories(self, obj: Manga) -> list[str]:
        return [c.name for c in obj.categories.all()[:5]]

    def get_cover(self, obj: Manga) -> str:
        return obj.cover_url


class MangaDetailSerializer(serializers.ModelSerializer):
    categories = CategorySerializer(many=True, read_only=True)
    chapter_count = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

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
        ]

    def get_chapter_count(self, obj: Manga) -> int:
        return obj.chapters.count()

    def get_cover(self, obj: Manga) -> str:
        return obj.cover_url
