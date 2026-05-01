from django.contrib import admin
from django.utils.html import format_html

from .models import Favorite, Profile, ReadingList, ReadingListItem, ReadingProgress


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "preferred_language",
        "reader_mode",
        "birthdate",
        "birthdate_locked",
        "show_adult",
        "updated_at",
    )
    list_filter = ("show_adult", "reader_mode", "preferred_language")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("created_at", "updated_at", "birthdate_set_at", "age_display")
    fieldsets = (
        (None, {"fields": ("user", "avatar", "bio")}),
        ("Reader", {"fields": ("preferred_language", "reader_mode")}),
        (
            "Idade & Conteúdo adulto",
            {
                "fields": (
                    "birthdate",
                    "birthdate_set_at",
                    "age_display",
                    "show_adult",
                ),
                "description": (
                    "A data de nascimento é definida pelo usuário uma única vez. "
                    "Para destravar a edição (correção legítima), limpe o campo "
                    "<b>birthdate_set_at</b> manualmente abaixo e salve."
                ),
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(boolean=True, description="Birthdate travada?")
    def birthdate_locked(self, obj: Profile) -> bool:
        return obj.birthdate_set_at is not None

    @admin.display(description="Idade")
    def age_display(self, obj: Profile) -> str:
        a = obj.age
        if a is None:
            return "—"
        flag = "✅ 18+" if obj.is_adult else "🔒 menor"
        return format_html("{} ({})", a, flag)

    def get_readonly_fields(self, request, obj=None):
        # Admins can override birthdate, mas o campo *_set_at é manualmente
        # editável (limpável) para destravar via fieldsets.
        return self.readonly_fields


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "manga", "created_at")
    search_fields = ("user__username", "manga__title")
    autocomplete_fields = ("user", "manga")


class ReadingListItemInline(admin.TabularInline):
    model = ReadingListItem
    extra = 0
    autocomplete_fields = ("manga",)


@admin.register(ReadingList)
class ReadingListAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "is_public", "updated_at")
    list_filter = ("is_public",)
    search_fields = ("name", "user__username")
    inlines = [ReadingListItemInline]


@admin.register(ReadingProgress)
class ReadingProgressAdmin(admin.ModelAdmin):
    list_display = ("user", "chapter", "page_number", "completed", "updated_at")
    list_filter = ("completed",)
    search_fields = ("user__username", "chapter__manga__title")
    raw_id_fields = ("user", "chapter")
