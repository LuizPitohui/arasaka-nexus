from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MangaViewSet, CategoryViewSet, ChapterViewSet, get_chapter_pages

# Roteador automático para as APIs padrão (CRUD)
router = DefaultRouter()
router.register(r'mangas', MangaViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'chapters', ChapterViewSet)

urlpatterns = [
    # Rotas geradas pelo router (api/mangas/, api/chapters/...)
    path('', include(router.urls)),
    
    # Rota manual do Leitor
    path('read/<int:chapter_id>/', get_chapter_pages, name='read_chapter'),
]