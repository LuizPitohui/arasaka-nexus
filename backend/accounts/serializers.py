from rest_framework import serializers

from employees.models import Manga
from employees.serializers import MangaListSerializer

from .models import Favorite, Profile, ReadingList, ReadingListItem, ReadingProgress


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
            "email",
            "avatar",
            "bio",
            "preferred_language",
            "reader_mode",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "username", "email", "created_at", "updated_at"]


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Subset that the user is allowed to mutate."""

    class Meta:
        model = Profile
        fields = ["avatar", "bio", "preferred_language", "reader_mode"]


class FavoriteSerializer(serializers.ModelSerializer):
    manga = MangaListSerializer(read_only=True)
    manga_id = serializers.PrimaryKeyRelatedField(
        queryset=Manga.objects.filter(is_active=True),
        source="manga",
        write_only=True,
    )

    class Meta:
        model = Favorite
        fields = ["id", "manga", "manga_id", "created_at"]
        read_only_fields = ["id", "created_at"]


class ReadingListItemSerializer(serializers.ModelSerializer):
    manga = MangaListSerializer(read_only=True)
    manga_id = serializers.PrimaryKeyRelatedField(
        queryset=Manga.objects.filter(is_active=True),
        source="manga",
        write_only=True,
    )

    class Meta:
        model = ReadingListItem
        fields = ["id", "manga", "manga_id", "position", "added_at"]
        read_only_fields = ["id", "added_at"]


class ReadingListSerializer(serializers.ModelSerializer):
    items = ReadingListItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = ReadingList
        fields = [
            "id",
            "name",
            "description",
            "is_public",
            "created_at",
            "updated_at",
            "items",
            "item_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingProgressSerializer(serializers.ModelSerializer):
    chapter_number = serializers.CharField(source="chapter.number", read_only=True)
    chapter_title = serializers.CharField(source="chapter.title", read_only=True)
    manga_id = serializers.IntegerField(source="chapter.manga_id", read_only=True)
    manga_title = serializers.CharField(source="chapter.manga.title", read_only=True)
    manga_cover = serializers.CharField(source="chapter.manga.cover_url", read_only=True)

    class Meta:
        model = ReadingProgress
        fields = [
            "id",
            "chapter",
            "chapter_number",
            "chapter_title",
            "manga_id",
            "manga_title",
            "manga_cover",
            "page_number",
            "completed",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
