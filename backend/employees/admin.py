from django.contrib import admin
from .models import Manga, Category, Chapter, ChapterImage, Work

class ChapterImageInline(admin.TabularInline):
    model = ChapterImage
    extra = 1 # Começa com um espaço vazio para adicionar imagem

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}

class MangaSourceInline(admin.TabularInline):
    """Mostra todas as variantes (Manga) ligadas a uma Work. Read-only —
    pra reatribuir, edite o ``Manga.work`` na lista de Mangas."""
    model = Manga
    fields = ("title", "source_id", "is_active")
    readonly_fields = ("title", "source_id", "is_active")
    extra = 0
    can_delete = False
    show_change_link = True


@admin.register(Work)
class WorkAdmin(admin.ModelAdmin):
    list_display = ("canonical_title", "slug", "source_count", "created_at")
    search_fields = ("canonical_title", "normalized_title", "slug")
    readonly_fields = ("normalized_title", "created_at")
    inlines = [MangaSourceInline]

    def source_count(self, obj):
        return obj.mangas.count()

    source_count.short_description = "Fontes"


@admin.register(Manga)
class MangaAdmin(admin.ModelAdmin):
    list_display = ('title', 'source_id', 'work', 'author', 'status', 'is_active', 'created_at')
    list_filter = ('source_id', 'status', 'categories', 'is_active')
    search_fields = ('title', 'author', 'work__canonical_title')
    autocomplete_fields = ('work',)

@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ('manga', 'number', 'title', 'release_date')
    list_filter = ('manga',)
    search_fields = ('number', 'title', 'manga__title')
    inlines = [ChapterImageInline] # <--- AQUI ESTÁ A MÁGICA