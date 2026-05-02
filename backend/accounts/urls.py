from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FavoriteViewSet,
    ReadingListViewSet,
    ReadingProgressViewSet,
    library_overview,
    profile_me,
    push_status,
    push_subscribe,
    push_unsubscribe,
)

router = DefaultRouter()
router.register(r"favorites", FavoriteViewSet, basename="favorite")
router.register(r"lists", ReadingListViewSet, basename="reading-list")
router.register(r"progress", ReadingProgressViewSet, basename="reading-progress")

urlpatterns = [
    path("profile/", profile_me, name="profile-me"),
    path("library/", library_overview, name="library-overview"),
    path("push/subscribe/", push_subscribe, name="push-subscribe"),
    path("push/unsubscribe/", push_unsubscribe, name="push-unsubscribe"),
    path("push/status/", push_status, name="push-status"),
    path("", include(router.urls)),
]
