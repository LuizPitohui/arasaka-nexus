"""Tests for the user library: profile, favorites, lists, progress."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from employees.models import Chapter, Manga

from .models import Favorite, Profile, ReadingList, ReadingListItem, ReadingProgress

User = get_user_model()

LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-cache",
    }
}


def _make_user(username="agent", password="StrongPass!42"):
    return User.objects.create_user(username=username, password=password)


def _make_manga(title="Manga"):
    return Manga.objects.create(title=title)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class ProfileTests(APITestCase):
    def test_profile_auto_created_via_signal(self):
        user = _make_user()
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_get_profile_requires_auth(self):
        response = self.client.get("/api/accounts/profile/")
        self.assertEqual(response.status_code, 401)

    def test_get_profile_returns_self(self):
        user = _make_user()
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/accounts/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], user.username)

    def test_patch_profile_updates_only_allowed_fields(self):
        user = _make_user()
        self.client.force_authenticate(user=user)
        response = self.client.patch(
            "/api/accounts/profile/",
            {"bio": "agent of chaos", "reader_mode": "paged"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bio"], "agent of chaos")
        self.assertEqual(response.data["reader_mode"], "paged")

    def test_patch_profile_rejects_invalid_reader_mode(self):
        user = _make_user()
        self.client.force_authenticate(user=user)
        response = self.client.patch(
            "/api/accounts/profile/", {"reader_mode": "lol"}, format="json"
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class FavoriteTests(APITestCase):
    def test_create_favorite(self):
        user = _make_user()
        manga = _make_manga()
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/accounts/favorites/", {"manga_id": manga.id}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Favorite.objects.filter(user=user, manga=manga).exists())

    def test_check_favorite_endpoint(self):
        user = _make_user()
        manga = _make_manga()
        Favorite.objects.create(user=user, manga=manga)
        self.client.force_authenticate(user=user)
        response = self.client.get(f"/api/accounts/favorites/check/?manga_id={manga.id}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_favorite"])

    def test_check_other_users_favorites_returns_false(self):
        owner = _make_user("owner")
        other = _make_user("other")
        manga = _make_manga()
        Favorite.objects.create(user=owner, manga=manga)
        self.client.force_authenticate(user=other)
        response = self.client.get(f"/api/accounts/favorites/check/?manga_id={manga.id}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_favorite"])

    def test_unfavorite_by_manga(self):
        user = _make_user()
        manga = _make_manga()
        Favorite.objects.create(user=user, manga=manga)
        self.client.force_authenticate(user=user)
        response = self.client.delete(f"/api/accounts/favorites/by-manga/{manga.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Favorite.objects.filter(user=user, manga=manga).exists())

    def test_anon_cannot_create_favorite(self):
        manga = _make_manga()
        response = self.client.post(
            "/api/accounts/favorites/", {"manga_id": manga.id}, format="json"
        )
        self.assertEqual(response.status_code, 401)


# ---------------------------------------------------------------------------
# Reading Lists
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class ReadingListTests(APITestCase):
    def test_create_list_and_add_manga(self):
        user = _make_user()
        manga = _make_manga()
        self.client.force_authenticate(user=user)

        create = self.client.post(
            "/api/accounts/lists/",
            {"name": "Para reler", "description": "favoritos eternos"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        list_id = create.data["id"]

        add = self.client.post(
            f"/api/accounts/lists/{list_id}/add/",
            {"manga_id": manga.id},
            format="json",
        )
        self.assertEqual(add.status_code, 201)
        self.assertTrue(
            ReadingListItem.objects.filter(reading_list_id=list_id, manga=manga).exists()
        )

    def test_user_only_sees_own_lists(self):
        owner = _make_user("owner")
        ReadingList.objects.create(user=owner, name="x")
        other = _make_user("other")
        self.client.force_authenticate(user=other)
        response = self.client.get("/api/accounts/lists/")
        self.assertEqual(response.status_code, 200)
        # DRF paginated response
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 0)

    def test_remove_manga_from_list(self):
        user = _make_user()
        manga = _make_manga()
        rl = ReadingList.objects.create(user=user, name="x")
        ReadingListItem.objects.create(reading_list=rl, manga=manga)
        self.client.force_authenticate(user=user)
        response = self.client.delete(f"/api/accounts/lists/{rl.id}/items/{manga.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            ReadingListItem.objects.filter(reading_list=rl, manga=manga).exists()
        )


# ---------------------------------------------------------------------------
# Reading Progress
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class ReadingProgressTests(APITestCase):
    def setUp(self):
        self.user = _make_user()
        self.manga = _make_manga()
        self.chapter = Chapter.objects.create(manga=self.manga, number=1)
        self.client.force_authenticate(user=self.user)

    def test_post_creates_progress(self):
        response = self.client.post(
            "/api/accounts/progress/",
            {"chapter": self.chapter.id, "page_number": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        progress = ReadingProgress.objects.get(user=self.user, chapter=self.chapter)
        self.assertEqual(progress.page_number, 5)
        self.assertFalse(progress.completed)

    def test_post_upserts_progress(self):
        ReadingProgress.objects.create(
            user=self.user, chapter=self.chapter, page_number=1, completed=False
        )
        response = self.client.post(
            "/api/accounts/progress/",
            {"chapter": self.chapter.id, "page_number": 12, "completed": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        progress = ReadingProgress.objects.get(user=self.user, chapter=self.chapter)
        self.assertEqual(progress.page_number, 12)
        self.assertTrue(progress.completed)
        self.assertEqual(
            ReadingProgress.objects.filter(user=self.user, chapter=self.chapter).count(),
            1,
        )

    def test_continue_endpoint_returns_only_in_progress(self):
        # Completed shouldn't appear
        ReadingProgress.objects.create(
            user=self.user, chapter=self.chapter, completed=True
        )
        response = self.client.get("/api/accounts/progress/continue/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_continue_returns_only_latest_per_manga(self):
        ch2 = Chapter.objects.create(manga=self.manga, number=2)
        ReadingProgress.objects.create(user=self.user, chapter=self.chapter, completed=False)
        ReadingProgress.objects.create(user=self.user, chapter=ch2, completed=False)
        response = self.client.get("/api/accounts/progress/continue/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        # Latest = highest id
        self.assertEqual(response.data[0]["chapter"], ch2.id)


# ---------------------------------------------------------------------------
# Library overview
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class LibraryOverviewTests(APITestCase):
    def test_returns_aggregated_data(self):
        user = _make_user()
        manga = _make_manga()
        Favorite.objects.create(user=user, manga=manga)
        rl = ReadingList.objects.create(user=user, name="Para ler")
        chapter = Chapter.objects.create(manga=manga, number=1)
        ReadingProgress.objects.create(user=user, chapter=chapter)
        del rl

        self.client.force_authenticate(user=user)
        response = self.client.get("/api/accounts/library/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["favorites"]), 1)
        self.assertEqual(len(response.data["lists"]), 1)
        self.assertEqual(len(response.data["in_progress"]), 1)
