from rest_framework import serializers

from employees.models import Manga
from employees.serializers import MangaListSerializer

from .models import Favorite, Profile, ReadingList, ReadingListItem, ReadingProgress


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    is_adult = serializers.BooleanField(read_only=True)
    age = serializers.IntegerField(read_only=True)
    birthdate_locked = serializers.SerializerMethodField()

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
            "birthdate",
            "birthdate_locked",
            "age",
            "is_adult",
            "show_adult",
            "digest_mode",
            "digest_hour",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "username",
            "email",
            "created_at",
            "updated_at",
            "birthdate_locked",
            "age",
            "is_adult",
        ]

    def get_birthdate_locked(self, obj: Profile) -> bool:
        return obj.birthdate_set_at is not None


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Subset that the user is allowed to mutate.

    ``birthdate`` is special: the user can only fill it once (when the field
    is currently null on a legacy account). Subsequent attempts raise a 400 —
    they must contact the admin via the support email.
    ``show_adult`` only flips when the user is an adult.
    """

    class Meta:
        model = Profile
        fields = [
            "avatar",
            "bio",
            "preferred_language",
            "reader_mode",
            "birthdate",
            "show_adult",
            "digest_mode",
            "digest_hour",
        ]

    def validate_digest_hour(self, value):
        if value < 0 or value > 23:
            raise serializers.ValidationError("Hora deve ser entre 0 e 23.")
        return value

    def validate_birthdate(self, value):
        instance: Profile | None = self.instance
        if instance and instance.birthdate_set_at is not None:
            raise serializers.ValidationError(
                "Data de nascimento já registrada e bloqueada. "
                "Para alterar, contate o administrador."
            )
        from datetime import date

        if value and value > date.today():
            raise serializers.ValidationError("Data de nascimento inválida.")
        if value:
            today = date.today()
            age = (
                today.year
                - value.year
                - ((today.month, today.day) < (value.month, value.day))
            )
            if age < 13:
                raise serializers.ValidationError(
                    "Idade mínima é 13 anos."
                )
        return value

    def validate_show_adult(self, value):
        instance: Profile | None = self.instance
        if value and instance and not instance.is_adult:
            # Will only become valid once a birthdate is provided AND >= 18.
            raise serializers.ValidationError(
                "Conteúdo adulto exige verificação de idade (18+)."
            )
        return value

    def update(self, instance, validated_data):
        from django.utils import timezone

        new_birthdate = validated_data.get("birthdate")
        if new_birthdate and instance.birthdate_set_at is None:
            validated_data["birthdate_set_at"] = timezone.now()
        return super().update(instance, validated_data)


class FavoriteSerializer(serializers.ModelSerializer):
    manga = MangaListSerializer(read_only=True)
    manga_id = serializers.PrimaryKeyRelatedField(
        queryset=Manga.objects.filter(is_active=True),
        source="manga",
        write_only=True,
    )

    class Meta:
        model = Favorite
        fields = ["id", "manga", "manga_id", "notify_on_new_chapter", "created_at"]
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
