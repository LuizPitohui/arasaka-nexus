from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MangaViewSet, 
    CategoryViewSet, 
    ChapterViewSet, 
    get_chapter_pages, 
    search_mangas, 
    import_manga,
    home_content # <--- Importe a nova função
)

router = DefaultRouter()
router.register(r'mangas', MangaViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'chapters', ChapterViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('read/<int:chapter_id>/', get_chapter_pages, name='read_chapter'),
    path('search/', search_mangas, name='search_mangas'),
    path('import/', import_manga, name='import_manga'),
    
    # NOVA ROTA
    path('home-data/', home_content, name='home_content'),
]