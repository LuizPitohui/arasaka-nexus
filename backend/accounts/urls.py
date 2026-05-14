from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FavoriteViewSet,
    ReadingListViewSet,
    ReadingProgressViewSet,
    follow_toggle,
    followers_list,
    following_list,
    leaderboard,
    library_overview,
    library_unread_count,
    profile_avatar,
    profile_me,
    public_user_lists,
    public_user_profile,
    push_clicked,
    push_status,
    push_subscribe,
    push_test,
    push_unsubscribe,
    rank_me,
    seasons_list,
)

router = DefaultRouter()
router.register(r"favorites", FavoriteViewSet, basename="favorite")
router.register(r"lists", ReadingListViewSet, basename="reading-list")
router.register(r"progress", ReadingProgressViewSet, basename="reading-progress")

urlpatterns = [
    path("profile/", profile_me, name="profile-me"),
    path("profile/avatar/", profile_avatar, name="profile-avatar"),
    path("library/", library_overview, name="library-overview"),
    path("library/unread-count/", library_unread_count, name="library-unread-count"),
    path("push/subscribe/", push_subscribe, name="push-subscribe"),
    path("push/unsubscribe/", push_unsubscribe, name="push-unsubscribe"),
    path("push/status/", push_status, name="push-status"),
    path("push/test/", push_test, name="push-test"),
    path("push/clicked/", push_clicked, name="push-clicked"),
    path("rank/me/", rank_me, name="rank-me"),
    path("leaderboard/", leaderboard, name="leaderboard"),
    path("seasons/", seasons_list, name="seasons-list"),
    # Comunidade — perfis publicos, follow, listas compartilhadas
    path("users/<str:username>/", public_user_profile, name="public-user-profile"),
    path("users/<str:username>/lists/", public_user_lists, name="public-user-lists"),
    path("follow/<str:username>/", follow_toggle, name="follow-toggle"),
    path("me/followers/", followers_list, name="followers-list"),
    path("me/following/", following_list, name="following-list"),
    path("", include(router.urls)),
]
