from django.contrib import admin
from .models import Manga, Category, Chapter, ChapterImage

class ChapterImageInline(admin.TabularInline):
    model = ChapterImage
    extra = 1 # Começa com um espaço vazio para adicionar imagem

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}

@admin.register(Manga)
class MangaAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'status', 'is_active', 'created_at')
    list_filter = ('status', 'categories', 'is_active')
    search_fields = ('title', 'author')

@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ('manga', 'number', 'title', 'release_date')
    list_filter = ('manga',)
    inlines = [ChapterImageInline] # <--- AQUI ESTÁ A MÁGICA