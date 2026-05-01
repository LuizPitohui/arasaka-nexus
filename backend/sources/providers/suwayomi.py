"""Suwayomi-Server — agregador que roda extensões Mihon nativamente.

Em vez de portar provider por provider (cada scan com seu antibot, mudança
de domínio, etc), delegamos pro Suwayomi via API REST. Ele:

  - Importa as extensões Kotlin/Java do Mihon sem porte
  - Lida com Cloudflare/JS challenge via WebView Android nativo
  - Auto-atualiza extensões seguindo o ritmo da comunidade
  - Expõe REST simples + GraphQL para clientes externos

Endpoints relevantes:

  GET  /api/v1/extension/list                       todas extensões disponíveis
  POST /api/v1/extension/install/{pkgName}          instala extensão
  GET  /api/v1/source/list                          fontes (extensões) instaladas
  GET  /api/v1/source/{sourceId}/search?searchTerm  busca em fonte específica
  GET  /api/v1/manga/{mangaId}                      detalhes da obra
  GET  /api/v1/manga/{mangaId}/chapters             lista capítulos
  GET  /api/v1/chapter/{chapterId}                  detalhes capítulo (pageCount)
  GET  /api/v1/manga/{mangaId}/chapter/{idx}/page/{n}  bytes da página

A relação `manga.id` (int) e `chapter.id` (int) são internas do Suwayomi.
Mantemos `external_id` no nosso DTO no formato `<sourceId>:<mangaId>` pra
roteamento posterior em `fetch_manga`/`fetch_chapters`/`fetch_pages`.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.cache import cache

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


_SOURCE_LIST_CACHE_KEY = "sources:suwayomi:source_list"
_SOURCE_LIST_TTL_SECONDS = 5 * 60


class SuwayomiSource(BaseSource):
    """Agregador. Cada `external_id` é `<innerSourceId>:<mangaId>`."""

    id = "mihon"
    name = "Mihon Network"
    base_url = ""  # populado via settings.SUWAYOMI_URL
    languages = ["pt-br", "en", "es-la", "ja", "ko", "zh"]  # depende das extensões instaladas
    kind = "hybrid"

    REQUEST_TIMEOUT = 15
    SEARCH_PER_SOURCE_TIMEOUT = 8
    SEARCH_MAX_PARALLEL = 6

    def __init__(self):
        self.base_url = (getattr(settings, "SUWAYOMI_URL", "") or "").rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------
    @property
    def is_configured(self) -> bool:
        return bool(self.base_url)

    def _get(self, path: str, **params) -> Optional[dict | list]:
        if not self.is_configured:
            return None
        url = f"{self.base_url}{path}"
        try:
            r = self.session.get(url, params=params or None, timeout=self.REQUEST_TIMEOUT)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            logger.warning("Suwayomi GET %s falhou: %s", path, exc)
            return None

    def _list_sources(self, force_refresh: bool = False) -> list[dict]:
        """Lista as extensões instaladas no Suwayomi (cache 5min)."""
        if not force_refresh:
            cached = cache.get(_SOURCE_LIST_CACHE_KEY)
            if cached is not None:
                return cached
        data = self._get("/api/v1/source/list")
        rows = data if isinstance(data, list) else []
        # filtra fontes que tem search habilitado (alguns são "browse only")
        rows = [s for s in rows if s.get("supportsLatest") is not False]
        cache.set(_SOURCE_LIST_CACHE_KEY, rows, _SOURCE_LIST_TTL_SECONDS)
        return rows

    def _source_name_map(self) -> dict[str, str]:
        """Mapa id (str) -> displayName legível pro frontend."""
        return {
            str(s.get("id")): (s.get("displayName") or s.get("name") or str(s.get("id")))
            for s in self._list_sources()
        }

    def list_sources_public(self) -> list[dict]:
        """Wrapper público com shape estável pro endpoint admin."""
        return [
            {
                "id": str(s.get("id") or ""),
                "name": s.get("displayName") or s.get("name") or "",
                "lang": s.get("lang") or "",
                "icon": s.get("iconUrl") or "",
                "is_nsfw": bool(s.get("isNsfw")),
            }
            for s in self._list_sources()
        ]

    # ------------------------------------------------------------------
    # Browse (popular / latest) — usado em backfill e pull noturno
    # ------------------------------------------------------------------
    def browse(
        self,
        inner_source_id: str,
        *,
        kind: str = "popular",
        page: int = 1,
    ) -> tuple[list[MangaDTO], bool]:
        """Pagina o catalogo de uma extensao Mihon.

        kind: 'popular' ou 'latest'
        Retorna: (lista_de_dtos, has_next_page)
        """
        if not self.is_configured:
            return [], False
        path = f"/api/v1/source/{quote(str(inner_source_id), safe='')}/{kind}/{page}"
        data = self._get(path)
        if not isinstance(data, dict):
            return [], False
        items = data.get("mangaList") or []
        has_next = bool(data.get("hasNextPage"))
        out: list[MangaDTO] = []
        for m in items:
            mid = m.get("id")
            if mid is None:
                continue
            cover = m.get("thumbnailUrl") or ""
            if cover.startswith("/"):
                cover = f"{self.base_url}{cover}"
            out.append(
                MangaDTO(
                    external_id=f"{inner_source_id}:{mid}",
                    title=m.get("title") or "(sem título)",
                    url=m.get("realUrl") or "",
                    cover_url=cover,
                    description=m.get("description") or "",
                    author=m.get("author") or "",
                    status=self._map_status(m.get("status")),
                    languages=[],
                )
            )
        return out, has_next

    # ------------------------------------------------------------------
    # Search (fan-out paralelo nas extensões instaladas)
    # ------------------------------------------------------------------
    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        if not (self.is_configured and query.strip()):
            return []
        sources = self._list_sources()
        if not sources:
            return []

        results: list[MangaDTO] = []
        with ThreadPoolExecutor(max_workers=min(self.SEARCH_MAX_PARALLEL, len(sources))) as pool:
            futures = {
                pool.submit(self._search_one, src["id"], src.get("displayName") or src.get("name") or "", query): src
                for src in sources
            }
            for fut in as_completed(futures, timeout=self.SEARCH_PER_SOURCE_TIMEOUT * 2):
                try:
                    chunk = fut.result(timeout=self.SEARCH_PER_SOURCE_TIMEOUT)
                except Exception as exc:
                    logger.debug("Suwayomi search worker explodiu: %s", exc)
                    continue
                results.extend(chunk)
        return results[:60]

    def _search_one(self, inner_source_id: str, source_name: str, query: str) -> list[MangaDTO]:
        path = f"/api/v1/source/{quote(str(inner_source_id), safe='')}/search"
        data = self._get(path, searchTerm=query, pageNum=1)
        if not data:
            return []
        items = (data.get("mangaList") if isinstance(data, dict) else data) or []
        out: list[MangaDTO] = []
        for m in items[:10]:  # cap por fonte pra nao explodir o frontend
            mid = m.get("id")
            if mid is None:
                continue
            cover_url = m.get("thumbnailUrl") or ""
            # Suwayomi serve thumbs via proxy interno; transformamos em URL absoluta
            if cover_url.startswith("/"):
                cover_url = f"{self.base_url}{cover_url}"
            out.append(
                MangaDTO(
                    external_id=f"{inner_source_id}:{mid}",
                    title=m.get("title") or "(sem título)",
                    url=m.get("realUrl") or "",
                    cover_url=cover_url,
                    description=m.get("description") or "",
                    author=m.get("author") or "",
                    status=self._map_status(m.get("status")),
                    languages=[],
                )
            )
        return out

    @staticmethod
    def _map_status(s) -> str:
        if isinstance(s, str):
            v = s.lower()
            if v in ("ongoing", "publishing"):
                return "ongoing"
            if v in ("completed", "complete", "finished"):
                return "completed"
            if v in ("hiatus", "on hiatus"):
                return "hiatus"
        return ""

    # ------------------------------------------------------------------
    # Manga / Chapters / Pages
    # ------------------------------------------------------------------
    def fetch_manga(self, external_id: str) -> MangaDTO:
        inner_id, manga_id = self._split_external(external_id)
        if manga_id is None:
            return MangaDTO(external_id=external_id, title="(id inválido)")
        data = self._get(f"/api/v1/manga/{manga_id}")
        if not data:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        cover = data.get("thumbnailUrl") or ""
        if cover.startswith("/"):
            cover = f"{self.base_url}{cover}"
        return MangaDTO(
            external_id=external_id,
            title=data.get("title") or external_id,
            url=data.get("realUrl") or "",
            cover_url=cover,
            description=data.get("description") or "",
            author=data.get("author") or "",
            status=self._map_status(data.get("status")),
        )

    def fetch_chapters(
        self, external_id: str, language: Optional[str] = None
    ) -> list[ChapterDTO]:
        _, manga_id = self._split_external(external_id)
        if manga_id is None:
            return []
        data = self._get(f"/api/v1/manga/{manga_id}/chapters")
        items = data if isinstance(data, list) else []
        out: list[ChapterDTO] = []
        for ch in items:
            out.append(
                ChapterDTO(
                    external_id=str(ch.get("id") or ""),
                    number=float(ch.get("chapterNumber") or 0),
                    title=ch.get("name") or "",
                    language=language or "",
                    scanlator=ch.get("scanlator") or "",
                    url=ch.get("realUrl") or "",
                )
            )
        return out

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        """Retorna URLs das páginas. Endpoint Suwayomi:
        /api/v1/manga/{mangaId}/chapter/{index}/page/{n}

        chapter_external_id é o `chapter.id` global do Suwayomi. Precisamos
        descobrir mangaId + index — o /api/v1/chapter/<id> serve a web UI
        (HTML) e nao a API, entao usamos GraphQL pra essa lookup.
        """
        if not (chapter_external_id and self.is_configured):
            return []
        try:
            cid = int(chapter_external_id)
        except (TypeError, ValueError):
            return []

        try:
            r = self.session.post(
                f"{self.base_url}/api/graphql",
                json={
                    "query": "{ chapter(id: " + str(cid)
                    + ") { id pageCount sourceOrder mangaId } }"
                },
                timeout=self.REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            ch = (r.json().get("data") or {}).get("chapter") or {}
        except Exception as exc:
            logger.warning("Suwayomi fetch_pages GraphQL falhou: %s", exc)
            return []

        manga_id = ch.get("mangaId")
        # `sourceOrder` e o indice 0-based usado nas URLs REST de paginas;
        # `index` (1-based) e o sequencial historico do capitulo.
        idx = ch.get("sourceOrder")
        if idx is None:
            idx = ch.get("index")
        page_count = int(ch.get("pageCount") or 0)

        # pageCount=-1 significa que o Suwayomi ainda nao baixou as paginas;
        # uma chamada ao endpoint do capitulo dispara o fetch + cache.
        if page_count <= 0 and manga_id is not None and idx is not None:
            primer = self._get(f"/api/v1/manga/{manga_id}/chapter/{idx}")
            if isinstance(primer, dict):
                page_count = int(primer.get("pageCount") or 0)

        if not (manga_id is not None and idx is not None and page_count > 0):
            return []

        return [
            PageDTO(
                index=n,
                url=f"{self.base_url}/api/v1/manga/{manga_id}/chapter/{idx}/page/{n}",
            )
            for n in range(page_count)
        ]

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------
    def healthcheck(self) -> HealthResult:
        if not self.is_configured:
            return HealthResult(
                success=False,
                latency_ms=0,
                status_code=None,
                error_class="NotConfigured",
                error_message="SUWAYOMI_URL nao definido",
                extracted_count=0,
            )
        t0 = time.monotonic()
        try:
            r = self.session.get(f"{self.base_url}/api/v1/source/list", timeout=self.REQUEST_TIMEOUT)
            ms = int((time.monotonic() - t0) * 1000)
            payload = r.json() if r.ok else None
            count = len(payload) if isinstance(payload, list) else 0
            return HealthResult(
                success=r.status_code < 400 and count >= 0,
                latency_ms=ms,
                status_code=r.status_code,
                extracted_count=count,
            )
        except Exception as exc:
            return HealthResult(
                success=False,
                latency_ms=int((time.monotonic() - t0) * 1000),
                status_code=None,
                error_class=exc.__class__.__name__,
                error_message=str(exc)[:500],
                extracted_count=0,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _split_external(external_id: str) -> tuple[Optional[str], Optional[int]]:
        if ":" not in external_id:
            return None, None
        inner, mid = external_id.split(":", 1)
        try:
            return inner, int(mid)
        except (TypeError, ValueError):
            return inner, None
