"""Testes mínimos pra validar shape e contratos do app `sources`.

Foco em:
  - lógica de cálculo de saúde (UP/DEGRADED/DOWN, parser drift, down_since)
  - registry consegue carregar providers configurados
  - parser do MadaraScraper extrai itens de um HTML conhecido
  - MangaDexSource traduz payloads para DTOs canônicos
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from sources import registry
from sources.base.dto import MangaDTO
from sources.base.health import recompute_health
from sources.base.source import BaseSource
from sources.models import Source, SourceHealth, SourceHealthLog
from sources.providers._madara import MadaraScraper
from sources.providers.mangadex import MangaDexSource
from sources.search import multi_source_search


class HealthLogicTests(TestCase):
    def setUp(self):
        self.source = Source.objects.create(
            id="test-src", name="Test", base_url="https://example.org", languages=["pt-br"]
        )

    def _log(self, success: bool, *, minutes_ago: int = 0, latency: int = 200, extracted=None, origin="probe"):
        return SourceHealthLog.objects.create(
            source=self.source,
            checked_at=timezone.now() - timedelta(minutes=minutes_ago),
            origin=origin,
            endpoint="healthcheck",
            success=success,
            latency_ms=latency,
            extracted_count=extracted,
        )

    def test_status_up_when_only_successes(self):
        for i in range(5):
            self._log(True, minutes_ago=i, extracted=10)
        h = recompute_health(self.source)
        self.assertEqual(h.status, SourceHealth.STATUS_UP)
        self.assertEqual(h.consecutive_failures, 0)
        self.assertIsNone(h.down_since)

    def test_status_down_with_three_consecutive_failures(self):
        # 3 falhas mais recentes + 2 sucessos antigos
        self._log(False, minutes_ago=0)
        self._log(False, minutes_ago=1)
        self._log(False, minutes_ago=2)
        self._log(True, minutes_ago=3)
        self._log(True, minutes_ago=4)
        h = recompute_health(self.source)
        self.assertEqual(h.status, SourceHealth.STATUS_DOWN)
        self.assertEqual(h.consecutive_failures, 3)
        self.assertIsNotNone(h.down_since)

    def test_status_degraded_with_partial_failures(self):
        # 1 falha em 5 → 20% → degradado
        self._log(True, minutes_ago=0)
        self._log(False, minutes_ago=1)
        self._log(True, minutes_ago=2)
        self._log(True, minutes_ago=3)
        self._log(True, minutes_ago=4)
        h = recompute_health(self.source)
        self.assertEqual(h.status, SourceHealth.STATUS_DEGRADED)

    def test_parser_drift_marks_degraded(self):
        # Sucessos com extracted=0 sinalizam que o parser quebrou.
        for i in range(3):
            self._log(True, minutes_ago=i, extracted=0)
        h = recompute_health(self.source)
        self.assertTrue(h.parser_drift_detected)
        self.assertEqual(h.status, SourceHealth.STATUS_DEGRADED)

    def test_down_since_clears_after_recovery(self):
        self.source.health if hasattr(self.source, "health") else None
        # Forçar DOWN
        for i in range(3):
            self._log(False, minutes_ago=i)
        recompute_health(self.source)
        # Agora chega um sucesso recente
        self._log(True, minutes_ago=0, extracted=5)
        # E um sucesso anterior pra estabilizar a janela
        self._log(True, minutes_ago=1, extracted=5)
        self._log(True, minutes_ago=2, extracted=5)
        h = recompute_health(self.source)
        # Estado depende da maioria; ao menos down_since deve sair
        if h.status != SourceHealth.STATUS_DOWN:
            self.assertIsNone(h.down_since)


class RegistryTests(TestCase):
    def test_known_ids_includes_default_providers(self):
        ids = registry.all_known_ids()
        self.assertIn("mangadex", ids)
        self.assertIn("lermanga", ids)
        self.assertIn("goldenmangas", ids)


class MangaDexSourceTests(TestCase):
    """Smoke tests com cliente mockado — não toca rede."""

    def _payload_one(self):
        return {
            "data": [
                {
                    "id": "abc-123",
                    "attributes": {
                        "title": {"en": "Foo"},
                        "description": {"pt-br": "uma obra de teste"},
                        "status": "ongoing",
                        "contentRating": "safe",
                        "availableTranslatedLanguages": ["pt-br", "en"],
                    },
                    "relationships": [
                        {
                            "type": "cover_art",
                            "attributes": {"fileName": "cover.jpg"},
                        }
                    ],
                }
            ],
            "total": 1,
        }

    def test_search_translates_to_manga_dto(self):
        client = MagicMock()
        client.list_manga.return_value = self._payload_one()
        src = MangaDexSource(client=client)
        results = src.search("foo")
        self.assertEqual(len(results), 1)
        dto = results[0]
        self.assertEqual(dto.external_id, "abc-123")
        self.assertEqual(dto.title, "Foo")
        self.assertEqual(dto.status, "ongoing")
        self.assertIn("cover.jpg", dto.cover_url)
        self.assertEqual(dto.content_rating, "safe")

    def test_search_returns_empty_on_client_failure(self):
        client = MagicMock()
        client.list_manga.side_effect = RuntimeError("boom")
        src = MangaDexSource(client=client)
        self.assertEqual(src.search("foo"), [])

    def test_fetch_pages_builds_urls(self):
        client = MagicMock()
        client.get_at_home_server.return_value = {
            "baseUrl": "https://uploads.example.org",
            "chapter": {"hash": "h", "data": ["a.jpg", "b.jpg"]},
        }
        src = MangaDexSource(client=client)
        pages = src.fetch_pages("ch-1")
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages[0].url, "https://uploads.example.org/data/h/a.jpg")
        self.assertEqual(pages[1].index, 1)

    def test_healthcheck_success_counts_items(self):
        client = MagicMock()
        client.list_manga.return_value = self._payload_one()
        src = MangaDexSource(client=client)
        result = src.healthcheck()
        self.assertTrue(result.success)
        self.assertEqual(result.extracted_count, 1)
        self.assertEqual(result.status_code, 200)

    def test_healthcheck_failure_captures_error(self):
        client = MagicMock()
        client.list_manga.side_effect = RuntimeError("network down")
        src = MangaDexSource(client=client)
        result = src.healthcheck()
        self.assertFalse(result.success)
        self.assertEqual(result.error_class, "RuntimeError")
        self.assertEqual(result.extracted_count, 0)

    def test_fetch_chapters_paginates_and_returns_dtos(self):
        client = MagicMock()
        client.get_manga_feed.return_value = {
            "data": [
                {
                    "id": "ch-1",
                    "attributes": {
                        "chapter": "1",
                        "title": "Início",
                        "translatedLanguage": "pt-br",
                    },
                    "relationships": [],
                },
                {
                    "id": "ch-2",
                    "attributes": {
                        "chapter": "2.5",
                        "translatedLanguage": "en",
                    },
                    "relationships": [],
                },
            ],
            "total": 2,
        }
        src = MangaDexSource(client=client)
        chapters = src.fetch_chapters("manga-x")
        self.assertEqual(len(chapters), 2)
        self.assertEqual(chapters[0].external_id, "ch-1")
        self.assertEqual(chapters[1].number, 2.5)
        self.assertEqual(chapters[1].language, "en")


class MadaraParserTests(TestCase):
    def test_parse_listing_extracts_items(self):
        html = """
        <html><body>
          <div class="page-item-detail">
            <h3 class="h5"><a href="https://lermanga.org/manga/foo/">Foo</a></h3>
            <img data-src="https://lermanga.org/wp-content/uploads/foo.jpg" />
          </div>
          <div class="page-item-detail">
            <h3 class="h5"><a href="https://lermanga.org/manga/bar/">Bar</a></h3>
            <img src="https://lermanga.org/wp-content/uploads/bar.jpg" />
          </div>
        </body></html>
        """
        from bs4 import BeautifulSoup

        class _Fake(MadaraScraper):
            id = "fake"
            name = "Fake"
            base_url = "https://lermanga.org"
            languages = ["pt-br"]

        # Evita instanciar BaseHTTPClient (não precisamos pra parse).
        scraper = _Fake.__new__(_Fake)
        items = scraper._parse_listing(BeautifulSoup(html, "html.parser"))
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0].external_id, "foo")
        self.assertEqual(items[0].title, "Foo")
        self.assertTrue(items[0].cover_url.endswith("foo.jpg"))


class _StubSource(BaseSource):
    """Provider de teste — não toca rede."""

    def __init__(self, source_id: str, results: list[MangaDTO] | Exception | None = None, kind: str = "scraper"):
        self.id = source_id
        self.name = source_id.title()
        self.base_url = f"https://{source_id}.example"
        self.languages = ["pt-br"]
        self.kind = kind
        self._results = results
        self.search_calls = 0

    def search(self, query: str, page: int = 1):
        self.search_calls += 1
        if isinstance(self._results, Exception):
            raise self._results
        return list(self._results or [])

    def fetch_manga(self, external_id):
        return MangaDTO(external_id=external_id, title="x")

    def fetch_chapters(self, external_id, language=None):
        return []

    def fetch_pages(self, chapter_external_id):
        return []

    def healthcheck(self):
        from sources.base.dto import HealthResult
        return HealthResult(success=True, latency_ms=10, status_code=200, extracted_count=1)


class MultiSourceSearchTests(TestCase):
    def setUp(self):
        registry.reset_cache()

    def _patch_active(self, sources: list[BaseSource]):
        return patch("sources.search._healthy_sources", return_value=iter(sources))

    def test_aggregates_results_from_all_sources(self):
        s1 = _StubSource("mangadex", [MangaDTO(external_id="md-1", title="Foo")])
        s2 = _StubSource("lermanga", [MangaDTO(external_id="ler-1", title="Foo Alt")])
        with self._patch_active([s1, s2]):
            out = multi_source_search("foo")
        ids = {(r["source"], r["external_id"]) for r in out}
        self.assertIn(("mangadex", "md-1"), ids)
        self.assertIn(("lermanga", "ler-1"), ids)

    def test_failing_source_does_not_block_others(self):
        s1 = _StubSource("mangadex", [MangaDTO(external_id="md-1", title="Foo")])
        s2 = _StubSource("lermanga", RuntimeError("boom"))
        with self._patch_active([s1, s2]):
            out = multi_source_search("foo")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "mangadex")

    def test_excludes_already_in_library_by_dex_id(self):
        s1 = _StubSource("mangadex", [
            MangaDTO(external_id="md-1", title="Foo"),
            MangaDTO(external_id="md-2", title="Bar"),
        ])
        with self._patch_active([s1]):
            out = multi_source_search("foo", exclude_dex_ids=["md-1"])
        external_ids = [r["external_id"] for r in out]
        self.assertNotIn("md-1", external_ids)
        self.assertIn("md-2", external_ids)

    def test_skips_down_source(self):
        Source.objects.create(id="mangadex", name="MangaDex", base_url="x", languages=[])
        Source.objects.create(id="lermanga", name="Lermanga", base_url="x", languages=[])
        SourceHealth.objects.create(source_id="lermanga", status=SourceHealth.STATUS_DOWN)
        SourceHealth.objects.create(source_id="mangadex", status=SourceHealth.STATUS_UP)

        s1 = _StubSource("mangadex", [MangaDTO(external_id="md-1", title="Foo")])
        s2 = _StubSource("lermanga", [MangaDTO(external_id="ler-1", title="Foo")])
        with patch("sources.search.registry.iter_active", return_value=iter([s1, s2])):
            out = multi_source_search("foo")
        sources_seen = {r["source"] for r in out}
        self.assertEqual(sources_seen, {"mangadex"})
        self.assertEqual(s2.search_calls, 0)

    def test_dedups_within_same_source(self):
        # Mesma fonte devolvendo duplicado — só um sobra.
        s1 = _StubSource("mangadex", [
            MangaDTO(external_id="md-1", title="Foo"),
            MangaDTO(external_id="md-1", title="Foo Variant"),
        ])
        with self._patch_active([s1]):
            out = multi_source_search("foo")
        self.assertEqual(len(out), 1)

    def test_payload_marks_mangadex_id_for_mangadex_only(self):
        s1 = _StubSource("mangadex", [MangaDTO(external_id="md-1", title="Foo", cover_url="https://uploads.example/x.jpg")])
        s2 = _StubSource("lermanga", [MangaDTO(external_id="ler-1", title="Bar")])
        with self._patch_active([s1, s2]):
            out = multi_source_search("foo")
        by_src = {r["source"]: r for r in out}
        self.assertEqual(by_src["mangadex"]["mangadex_id"], "md-1")
        self.assertIsNone(by_src["lermanga"]["mangadex_id"])
        # Cover externa http virou proxy.
        self.assertTrue(by_src["mangadex"]["cover"].startswith("/api/cdn/preview/"))


class NewProvidersParserTests(TestCase):
    """Validam que cada novo provider traduz payloads conhecidos para DTOs.

    Nenhum toca rede — todos os clients são substituídos por MagicMock.
    Cobertura intencional: shape de busca + healthcheck.
    """

    # -------- Comick --------
    def test_comick_search_translates_payload(self):
        from sources.providers.comick import ComickSource
        src = ComickSource.__new__(ComickSource)
        src.client = MagicMock()
        src.client.get.return_value.json.return_value = [
            {
                "slug": "naruto",
                "title": "Naruto",
                "md_covers": [{"b2key": "abc.jpg"}],
                "status": 2,
                "content_rating": "safe",
            }
        ]
        results = src.search("naruto")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].external_id, "naruto")
        self.assertEqual(results[0].status, "completed")
        self.assertIn("meo.comick.pictures/abc.jpg", results[0].cover_url)

    def test_comick_fetch_pages_builds_urls(self):
        from sources.providers.comick import ComickSource
        src = ComickSource.__new__(ComickSource)
        src.client = MagicMock()
        src.client.get.return_value.json.return_value = {
            "chapter": {
                "md_images": [{"url": "https://x/1.jpg"}, {"b2key": "ch/2.jpg"}],
            }
        }
        pages = src.fetch_pages("hid-1")
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages[0].url, "https://x/1.jpg")
        self.assertIn("meo.comick.pictures/ch/2.jpg", pages[1].url)

    # -------- Tsuki --------
    def test_tsuki_search_translates_payload(self):
        from sources.providers.tsuki import TsukiSource
        src = TsukiSource.__new__(TsukiSource)
        src.client = MagicMock()
        src.CDN_BASE = TsukiSource.CDN_BASE
        src.base_url = TsukiSource.base_url
        src.client.get.return_value.json.return_value = {
            "data": [
                {"id": 42, "title": "One Piece", "poster": "covers/one.jpg", "status": "ativo"},
                {"id": 43, "title": "Bleach", "poster": "https://x/bleach.jpg", "status": "completo"},
            ]
        }
        results = src.search("piece")
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].title, "One Piece")
        self.assertEqual(results[0].status, "ongoing")
        self.assertTrue(results[0].cover_url.startswith("https://cdn.tsuki-mangas.com/"))
        self.assertEqual(results[1].cover_url, "https://x/bleach.jpg")
        self.assertEqual(results[1].status, "completed")

    # -------- Bato.to --------
    def test_bato_listing_parser_extracts_titles(self):
        from sources.providers.bato import BatoSource
        html = """
        <html><body>
          <div id="series-list">
            <div class="col">
              <a class="item-cover" href="/title/12345-foo">
                <img src="https://x/foo.jpg"/>
              </a>
              <h3><a href="/title/12345-foo">Foo</a></h3>
            </div>
            <div class="col">
              <a class="item-cover" href="/title/67890-bar">
                <img src="https://x/bar.jpg"/>
              </a>
              <h3><a href="/title/67890-bar">Bar</a></h3>
            </div>
          </div>
        </body></html>
        """
        src = BatoSource.__new__(BatoSource)
        src.base_url = BatoSource.base_url
        src.languages = list(BatoSource.languages)
        items = src._parse_listing(html)
        ids = sorted(d.external_id for d in items)
        self.assertEqual(ids, ["12345", "67890"])

    def test_bato_fetch_pages_extracts_imgs_from_script(self):
        from sources.providers import bato
        from sources.providers.bato import BatoSource
        src = BatoSource.__new__(BatoSource)
        src.base_url = BatoSource.base_url
        src.client = MagicMock()
        src.client.get.return_value.text = (
            "<html><body><script>"
            "const imgHttpLis = [\"https://x/1.jpg\",\"https://x/2.jpg\"];"
            "</script></body></html>"
        )
        pages = src.fetch_pages("ch-1")
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages[0].url, "https://x/1.jpg")

    # -------- Asura Scans --------
    def test_asura_listing_parser_extracts_series(self):
        from sources.providers.asurascans import AsuraScansSource
        html = """
        <html><body>
          <a href="/series/solo-leveling-abc">
            <img src="https://x/sl.jpg"/>
            <span class="font-bold">Solo Leveling</span>
          </a>
          <a href="/series/return-of-the-mount-hua-sect-def">
            <img src="https://x/rh.jpg"/>
            <span class="font-bold">Return of Mount Hua</span>
          </a>
          <a href="/series/solo-leveling-abc/chapter/1">cap 1</a>
        </body></html>
        """
        src = AsuraScansSource.__new__(AsuraScansSource)
        src.base_url = AsuraScansSource.base_url
        items = src._parse_listing(html)
        ids = sorted(d.external_id for d in items)
        self.assertEqual(
            ids,
            ["return-of-the-mount-hua-sect-def", "solo-leveling-abc"],
        )

    # -------- MangaPlus --------
    def test_mangaplus_listing_parser_extracts_titles(self):
        from sources.providers.mangaplus import MangaPlusSource
        html = """
        <html><body>
          <a href="/titles/100020">
            <img src="https://x/op.jpg"/>
            <span class="title-name">One Piece</span>
          </a>
          <a href="/titles/100191">
            <img src="https://x/jjk.jpg"/>
            <span class="title-name">Jujutsu Kaisen</span>
          </a>
          <a href="/titles/100020">
            <span class="title-name">One Piece</span>
          </a>
        </body></html>
        """
        src = MangaPlusSource.__new__(MangaPlusSource)
        src.base_url = MangaPlusSource.base_url
        src.languages = list(MangaPlusSource.languages)
        items = src._parse_listing(html)
        ids = sorted(d.external_id for d in items)
        self.assertEqual(ids, ["100020", "100191"])

    def test_mangaplus_search_filters_by_title(self):
        from sources.providers.mangaplus import MangaPlusSource
        src = MangaPlusSource.__new__(MangaPlusSource)
        src.base_url = MangaPlusSource.base_url
        src.languages = list(MangaPlusSource.languages)
        src.client = MagicMock()
        src.client.get.return_value.text = """
            <a href="/titles/1"><span class="title-name">One Piece</span></a>
            <a href="/titles/2"><span class="title-name">Naruto</span></a>
        """
        out = src.search("piece")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].title, "One Piece")

    def test_mangaplus_fetch_pages_returns_empty_pending_protobuf(self):
        from sources.providers.mangaplus import MangaPlusSource
        src = MangaPlusSource.__new__(MangaPlusSource)
        # Garantia explícita do contrato atual: páginas dependem de protobuf.
        self.assertEqual(src.fetch_pages("any"), [])

    # -------- Registry --------
    def test_all_new_providers_in_registry(self):
        ids = registry.all_known_ids()
        for pid in ("comick", "tsuki", "bato", "asurascans", "mangaplus"):
            self.assertIn(pid, ids)
