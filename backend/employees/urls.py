from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .auth_views import logout, me, register
from .views import (
    CategoryViewSet,
    ChapterViewSet,
    MangaViewSet,
    get_chapter_pages,
    home_content,
    import_manga,
    proxy_chapter_image,
    search_mangas,
)

router = DefaultRouter()
router.register(r"mangas", MangaViewSet)
router.register(r"categories", CategoryViewSet)
router.register(r"chapters", ChapterViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("read/<int:chapter_id>/", get_chapter_pages, name="read_chapter"),
    path(
        "cdn/chapter/<int:chapter_id>/<int:page_index>/",
        proxy_chapter_image,
        name="cdn_chapter_image",
    ),
    path("search/", search_mangas, name="search_mangas"),
    path("import/", import_manga, name="import_manga"),
    path("home-data/", home_content, name="home_content"),
    # Auth
    path("auth/register/", register, name="register"),
    path("auth/logout/", logout, name="logout"),
    path("auth/me/", me, name="me"),
]
