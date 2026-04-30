"""Integration tests for the employees app.

All MangaDex traffic is mocked — these tests never hit the network. The cache
is overridden to LocMemCache so we don't depend on a running Redis.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, Chapter, ChapterImage, Manga

User = get_user_model()


LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-cache",
    }
}


def _make_user(username="agent01", password="StrongPass!42", **kwargs):
    return User.objects.create_user(username=username, password=password, **kwargs)


def _make_admin(username="admin01", password="StrongPass!42"):
    return User.objects.create_user(username=username, password=password, is_staff=True)


def _seed_manga(title="Test Manga", **kwargs):
    return Manga.objects.create(title=title, **kwargs)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class AuthEndpointsTests(APITestCase):
    def test_register_creates_user_and_returns_tokens(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newagent",
                "email": "newagent@nexus.io",
                "password": "Sup3rSecret!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "newagent")
        self.assertTrue(User.objects.filter(username="newagent").exists())

    def test_register_rejects_duplicate_username(self):
        _make_user(username="dupe")
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "dupe",
                "email": "dupe@nexus.io",
                "password": "Sup3rSecret!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "weakling", "email": "x@y.io", "password": "12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_returns_access_and_refresh(self):
        _make_user(username="loginer", password="Sup3rSecret!")
        response = self.client.post(
            "/api/token/",
            {"username": "loginer", "password": "Sup3rSecret!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_me_requires_auth(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        user = _make_user()
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], user.username)

    def test_logout_blacklists_refresh_token(self):
        user = _make_user()
        login = self.client.post(
            "/api/token/",
            {"username": user.username, "password": "StrongPass!42"},
            format="json",
        )
        refresh = login.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        logout = self.client.post(
            "/api/auth/logout/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(logout.status_code, status.HTTP_205_RESET_CONTENT)

        # The refresh token should now be blacklisted.
        retry = self.client.post(
            "/api/token/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(retry.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# MangaViewSet — filters and discovery actions
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class MangaViewSetTests(APITestCase):
    def setUp(self):
        self.action = Category.objects.create(name="Action", slug="action")
        self.romance = Category.objects.create(name="Romance", slug="romance")

        self.naruto = _seed_manga(title="Naruto", status="COMPLETED")
        self.naruto.categories.add(self.action)

        self.bleach = _seed_manga(title="Bleach", status="ONGOING")
        self.bleach.categories.add(self.action)

        self.fruits = _seed_manga(title="Fruits Basket", status="COMPLETED")
        self.fruits.categories.add(self.romance)

        self.inactive = _seed_manga(title="Hidden", is_active=False)

    def test_list_excludes_inactive(self):
        response = self.client.get("/api/mangas/")
        self.assertEqual(response.status_code, 200)
        titles = [m["title"] for m in response.data["results"]]
        self.assertNotIn("Hidden", titles)

    def test_filter_by_genre_uses_AND(self):
        response = self.client.get("/api/mangas/?genre=action&genre=romance")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)

    def test_filter_by_status(self):
        response = self.client.get("/api/mangas/?status=ONGOING")
        titles = [m["title"] for m in response.data["results"]]
        self.assertEqual(titles, ["Bleach"])

    def test_ordering_alphabetical(self):
        response = self.client.get("/api/mangas/?ordering=alphabetical")
        titles = [m["title"] for m in response.data["results"]]
        self.assertEqual(titles, ["Bleach", "Fruits Basket", "Naruto"])

    def test_anon_cannot_delete(self):
        response = self.client.delete(f"/api/mangas/{self.naruto.id}/")
        self.assertIn(response.status_code, [401, 403])

    def test_authenticated_non_staff_cannot_delete(self):
        self.client.force_authenticate(user=_make_user())
        response = self.client.delete(f"/api/mangas/{self.naruto.id}/")
        self.assertEqual(response.status_code, 403)

    def test_staff_can_delete(self):
        self.client.force_authenticate(user=_make_admin())
        response = self.client.delete(f"/api/mangas/{self.naruto.id}/")
        self.assertEqual(response.status_code, 204)

    def test_popular_action_returns_paginated_results(self):
        response = self.client.get("/api/mangas/popular/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 3)

    def test_random_returns_a_manga(self):
        response = self.client.get("/api/mangas/random/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(response.data["title"], {"Naruto", "Bleach", "Fruits Basket"})

    def test_random_returns_404_when_empty(self):
        Manga.objects.all().delete()
        response = self.client.get("/api/mangas/random/")
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class CategoryTests(APITestCase):
    def test_with_counts_filters_zero_count_categories(self):
        c1 = Category.objects.create(name="Used", slug="used")
        Category.objects.create(name="Unused", slug="unused")
        manga = _seed_manga()
        manga.categories.add(c1)

        response = self.client.get("/api/categories/with_counts/")
        self.assertEqual(response.status_code, 200)
        slugs = [c["slug"] for c in response.data]
        self.assertIn("used", slugs)
        self.assertNotIn("unused", slugs)


# ---------------------------------------------------------------------------
# Search and import
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class SearchTests(APITestCase):
    def test_empty_query_returns_empty(self):
        response = self.client.get("/api/search/?q=")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    @patch("employees.views.MangaDexScanner")
    def test_search_blends_local_and_external(self, scanner_cls):
        _seed_manga(title="Berserk", mangadex_id="abc-123")
        scanner = scanner_cls.return_value
        scanner.search_manga.return_value = [
            {
                "mangadex_id": "abc-123",  # duplicate of local; should be deduped
                "title": "Berserk",
                "cover": "",
                "description": "",
                "status": "ONGOING",
            },
            {
                "mangadex_id": "xyz-999",
                "title": "Berserk Side Story",
                "cover": "",
                "description": "",
                "status": "ONGOING",
            },
        ]

        response = self.client.get("/api/search/?q=berserk")
        self.assertEqual(response.status_code, 200)
        ids = [r["mangadex_id"] for r in response.data]
        self.assertEqual(ids.count("abc-123"), 1)
        self.assertIn("xyz-999", ids)
        local_entries = [r for r in response.data if r["mangadex_id"] == "abc-123"]
        self.assertTrue(local_entries[0]["in_library"])

    @patch("employees.views.MangaDexScanner")
    def test_local_first_skips_mangadex_when_catalogue_is_strong(self, scanner_cls):
        # 8+ local hits should make us skip the upstream call entirely.
        for i in range(10):
            _seed_manga(title=f"Naruto Volume {i}", mangadex_id=f"local-{i}")
        response = self.client.get("/api/search/?q=naruto")
        self.assertEqual(response.status_code, 200)
        scanner_cls.assert_not_called()
        # all returned entries are flagged as local
        self.assertTrue(all(r["in_library"] for r in response.data))


@override_settings(CACHES=LOCMEM_CACHE)
class ImportMangaTests(APITestCase):
    def test_import_requires_auth(self):
        response = self.client.post("/api/import/", {"mangadex_id": "abc"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_import_rejects_missing_id(self):
        self.client.force_authenticate(user=_make_user())
        response = self.client.post("/api/import/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("employees.views.task_import_manga_chapters")
    def test_import_dispatches_celery_task(self, task):
        task.delay.return_value = MagicMock(id="task-1234")
        self.client.force_authenticate(user=_make_user())
        response = self.client.post(
            "/api/import/", {"mangadex_id": "abc"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        task.delay.assert_called_once_with("abc")
        self.assertEqual(response.data["task_id"], "task-1234")


# ---------------------------------------------------------------------------
# Home content (Genesis Protocol must NOT block)
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class HomeContentTests(APITestCase):
    @patch("employees.views.task_seed_initial_library")
    def test_empty_library_dispatches_seed_task_without_blocking(self, task):
        response = self.client.get("/api/home-data/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["seeding"])
        task.delay.assert_called_once()

    @patch("employees.views.task_seed_initial_library")
    def test_populated_library_does_not_dispatch_seed(self, task):
        for i in range(6):
            _seed_manga(title=f"Manga {i}")
        response = self.client.get("/api/home-data/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["seeding"])
        task.delay.assert_not_called()


# ---------------------------------------------------------------------------
# Reader endpoint
# ---------------------------------------------------------------------------
@override_settings(CACHES=LOCMEM_CACHE)
class ChapterPagesTests(APITestCase):
    def setUp(self):
        self.manga = _seed_manga(mangadex_id="m-1")
        self.ch1 = Chapter.objects.create(manga=self.manga, number=1, mangadex_id="c-1")
        self.ch2 = Chapter.objects.create(manga=self.manga, number=2, mangadex_id="c-2")
        self.ch3 = Chapter.objects.create(manga=self.manga, number=3, mangadex_id="c-3")

    def test_navigation_reports_prev_next(self):
        response = self.client.get(f"/api/read/{self.ch2.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["navigation"]["prev"], self.ch1.id)
        self.assertEqual(response.data["navigation"]["next"], self.ch3.id)

    def test_local_images_take_priority(self):
        ChapterImage.objects.create(chapter=self.ch1, image="local.jpg", order=0)
        with patch("employees.views.get_mangadex_pages") as upstream:
            response = self.client.get(f"/api/read/{self.ch1.id}/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["source"], "LOCAL")
            upstream.assert_not_called()

    @patch("employees.views.get_mangadex_pages")
    def test_streams_from_mangadex_when_no_local_images(self, upstream):
        upstream.return_value = [{"id": 0, "image": "https://x/a.jpg", "order": 0}]
        response = self.client.get(f"/api/read/{self.ch1.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["source"], "MANGADEX_STREAM")
        upstream.assert_called_once_with("c-1")


# ---------------------------------------------------------------------------
# Scanner business logic (with mocked client)
# ---------------------------------------------------------------------------
class ScannerTests(APITestCase):
    def test_upsert_creates_manga_and_categories(self):
        from .services import MangaDexScanner

        client = MagicMock()
        client.list_manga.return_value = {
            "data": [
                {
                    "id": "dex-1",
                    "attributes": {
                        "title": {"en": "Test Title"},
                        "description": {"en": "Description"},
                        "status": "ongoing",
                        "tags": [
                            {"attributes": {"name": {"en": "Action"}}},
                            {"attributes": {"name": {"en": "Adventure"}}},
                        ],
                    },
                    "relationships": [
                        {
                            "type": "cover_art",
                            "attributes": {"fileName": "cover.jpg"},
                        }
                    ],
                }
            ]
        }
        # _process_batch will also attempt to sync chapters via the client.
        client.get_manga_feed.return_value = {"data": [], "total": 0}

        scanner = MangaDexScanner(client=client)
        ok = scanner._process_batch({})
        self.assertTrue(ok)

        manga = Manga.objects.get(mangadex_id="dex-1")
        self.assertEqual(manga.title, "Test Title")
        self.assertIn("https://uploads.mangadex.org/covers/dex-1/cover.jpg", manga.cover)
        self.assertEqual(manga.status, "ONGOING")
        self.assertEqual(set(manga.categories.values_list("name", flat=True)), {"Action", "Adventure"})

    def test_search_returns_empty_on_failure(self):
        from .services import MangaDexScanner

        client = MagicMock()
        client.list_manga.side_effect = RuntimeError("boom")
        scanner = MangaDexScanner(client=client)
        results = scanner.search_manga("anything")
        self.assertEqual(results, [])

    @override_settings(CACHES=LOCMEM_CACHE)
    def test_manga_detail_uses_cache_on_repeat_hits(self):
        from django.core.cache import cache as django_cache

        django_cache.clear()
        manga = _seed_manga(title="Cache Test")
        # First call populates cache
        r1 = self.client.get(f"/api/mangas/{manga.id}/")
        self.assertEqual(r1.status_code, 200)
        # Mutate underlying record — cached response should win on second call.
        Manga.objects.filter(id=manga.id).update(title="Mutated")
        r2 = self.client.get(f"/api/mangas/{manga.id}/")
        self.assertEqual(r2.data["title"], "Cache Test")

    @override_settings(CACHES=LOCMEM_CACHE)
    def test_cover_uses_local_path_when_present(self):
        manga = _seed_manga(title="With Local Cover")
        manga.cover = "https://example.com/remote.jpg"
        manga.cover_path = "covers/000001.jpg"
        manga.save()
        response = self.client.get(f"/api/mangas/{manga.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cover"], "/media/covers/000001.jpg")

    @override_settings(CACHES=LOCMEM_CACHE)
    def test_search_caches_repeat_queries(self):
        from .services import MangaDexScanner
        from django.core.cache import cache

        cache.clear()
        client = MagicMock()
        client.list_manga.return_value = {
            "data": [
                {
                    "id": "dex-x",
                    "attributes": {
                        "title": {"en": "Cached"},
                        "description": {"en": ""},
                        "status": "ongoing",
                    },
                    "relationships": [],
                }
            ]
        }
        scanner = MangaDexScanner(client=client)

        # First call hits upstream.
        scanner.search_manga("Cached")
        # Same query (case + whitespace differ) — should be cache hit, no upstream.
        scanner.search_manga("  cached  ")
        scanner.search_manga("CACHED")

        self.assertEqual(client.list_manga.call_count, 1)
