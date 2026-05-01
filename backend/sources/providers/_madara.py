"""Scraper genérico para sites baseados no tema WordPress + plugin Madara.

Vários sites BR (Lermanga, Goldenmangas, Brmangas, Slime Read, Hipercool, Argos,
Neox) usam essa stack. Eles compartilham:

  - Listagem em /manga/?page=N ou shortcode AJAX em wp-admin/admin-ajax.php
    (action=madara_load_more).
  - Página da obra em /manga/<slug>/, com lista de capítulos via JS POST em
    /manga/<slug>/ajax/chapters/ ou /wp-admin/admin-ajax.php.
  - Página do capítulo em /manga/<slug>/<chapter-slug>/, com imagens em
    <img class="wp-manga-chapter-img"> ou data-src.

A subclasse só precisa setar `id`, `name`, `base_url`, `languages`. Quirks
específicas (CSS classes, paths) podem ser sobrescritas via atributos de classe.

NOTA: Este módulo é uma BASE preparada para Cloudflare leve / nada. Sites com
JS challenge precisam de Playwright e devem subclassar de outra base no futuro.
"""

from __future__ import annotations

import logging
import re
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


class MadaraScraper(BaseSource):
    """Base parametrizável para sites Madara/MangaThemesia."""

    kind = "scraper"

    # Caminhos parametrizáveis (sobrescrever em subclasse se diferente).
    MANGA_PATH_PREFIX = "manga"  # /manga/<slug>/
    AJAX_LOAD_MORE_PATH = "wp-admin/admin-ajax.php"
    CHAPTERS_AJAX_PATH = "wp-admin/admin-ajax.php"

    # Seletores CSS — ajustáveis em subclasse para variações do tema.
    SEL_LIST_ITEM = "div.page-item-detail"
    SEL_LIST_TITLE = "h3.h5 a, .post-title a"
    SEL_LIST_COVER = "img"
    SEL_DETAIL_TITLE = ".post-title h1"
    SEL_DETAIL_COVER = ".summary_image img"
    SEL_DETAIL_DESC = ".description-summary, .summary__content"
    SEL_DETAIL_AUTHOR = ".author-content a"
    SEL_DETAIL_STATUS = ".post-status .summary-content"
    SEL_CHAPTER_LIST = "li.wp-manga-chapter"
    SEL_CHAPTER_LINK = "a"
    SEL_PAGE_IMG = "img.wp-manga-chapter-img, .reading-content img"

    def __init__(self):
        if not self.base_url:
            raise ValueError(f"{self.__class__.__name__}.base_url precisa ser definido")
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={"Referer": self.base_url + "/"},
        )

    # --------------------------- search ---------------------------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        # Madara expõe ?s=<query>&post_type=wp-manga
        params = {"s": query, "post_type": "wp-manga"}
        if page > 1:
            params["paged"] = page
        resp = self.client.get("/", endpoint="search", params=params)
        soup = BeautifulSoup(resp.text, "html.parser")
        return self._parse_listing(soup)

    # --------------------------- detail ---------------------------

    def fetch_manga(self, external_id: str) -> MangaDTO:
        # external_id é o slug.
        url = self._manga_url(external_id)
        resp = self.client.get(url, endpoint="manga")
        soup = BeautifulSoup(resp.text, "html.parser")

        title = self._text(soup.select_one(self.SEL_DETAIL_TITLE))
        cover = self._attr(soup.select_one(self.SEL_DETAIL_COVER), ["data-src", "src"])
        description = self._text(soup.select_one(self.SEL_DETAIL_DESC))
        author = self._text(soup.select_one(self.SEL_DETAIL_AUTHOR))
        status_raw = self._text(soup.select_one(self.SEL_DETAIL_STATUS)).lower()
        status = self._normalize_status(status_raw)

        return MangaDTO(
            external_id=external_id,
            title=title or external_id,
            url=url,
            cover_url=cover,
            description=description,
            author=author,
            status=status,
            languages=list(self.languages),
        )

    # --------------------------- chapters ---------------------------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        # Tenta primeiro via AJAX (mais confiável), fallback pra HTML.
        chapters = self._fetch_chapters_ajax(external_id)
        if not chapters:
            chapters = self._fetch_chapters_html(external_id)
        return chapters

    def _fetch_chapters_ajax(self, slug: str) -> list[ChapterDTO]:
        try:
            resp = self.client.request(
                "POST",
                f"/{self.MANGA_PATH_PREFIX}/{slug}/ajax/chapters/",
                endpoint="chapters_ajax",
                data={},
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
        except SourceHTTPError:
            return []
        if resp.status_code >= 400 or not resp.text.strip():
            return []
        return self._parse_chapter_list(resp.text, slug)

    def _fetch_chapters_html(self, slug: str) -> list[ChapterDTO]:
        resp = self.client.get(self._manga_url(slug), endpoint="chapters_html")
        return self._parse_chapter_list(resp.text, slug)

    def _parse_chapter_list(self, html: str, slug: str) -> list[ChapterDTO]:
        soup = BeautifulSoup(html, "html.parser")
        out: list[ChapterDTO] = []
        for li in soup.select(self.SEL_CHAPTER_LIST):
            link = li.select_one(self.SEL_CHAPTER_LINK)
            if not link:
                continue
            href = link.get("href", "")
            text = self._text(link)
            number = self._extract_number(text)
            external_id = self._chapter_id_from_url(href, slug)
            out.append(
                ChapterDTO(
                    external_id=external_id,
                    number=number,
                    title=text,
                    language=self.primary_language,
                    url=urljoin(self.base_url, href),
                )
            )
        return out

    # --------------------------- pages ---------------------------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        url = self._chapter_url(chapter_external_id)
        resp = self.client.get(url, endpoint="pages")
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[PageDTO] = []
        for i, img in enumerate(soup.select(self.SEL_PAGE_IMG)):
            src = self._attr(img, ["data-src", "data-lazy-src", "src"])
            if not src:
                continue
            out.append(
                PageDTO(
                    index=i,
                    url=src.strip(),
                    headers={"Referer": self.base_url + "/"},
                )
            )
        return out

    # --------------------------- health ---------------------------

    def healthcheck(self) -> HealthResult:
        """Probe: bate na home e tenta extrair ≥1 item da listagem."""
        import time

        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/",
                endpoint="healthcheck",
                record_telemetry=False,  # gravamos como probe abaixo
            )
        except SourceHTTPError as exc:
            return HealthResult(
                success=False,
                latency_ms=int((time.monotonic() - t0) * 1000),
                status_code=exc.status_code,
                error_class=exc.error_class,
                error_message=str(exc)[:500],
                extracted_count=0,
            )

        latency_ms = int((time.monotonic() - t0) * 1000)
        soup = BeautifulSoup(resp.text, "html.parser")
        items = self._parse_listing(soup)
        return HealthResult(
            success=resp.status_code < 400,
            latency_ms=latency_ms,
            status_code=resp.status_code,
            extracted_count=len(items),
        )

    # --------------------------- helpers ---------------------------

    def _manga_url(self, slug: str) -> str:
        return f"{self.base_url}/{self.MANGA_PATH_PREFIX}/{slug}/"

    def _chapter_url(self, external_id: str) -> str:
        # external_id no formato "<manga-slug>/<chapter-slug>"
        return f"{self.base_url}/{self.MANGA_PATH_PREFIX}/{external_id}/".rstrip("/") + "/"

    def _chapter_id_from_url(self, href: str, manga_slug: str) -> str:
        # Espera /manga/<slug>/<chapter-slug>/
        path = href.split("//", 1)[-1].split("/", 1)[-1] if "//" in href else href
        parts = [p for p in path.split("/") if p]
        # Remove a primeira ocorrência do prefixo se existir
        if self.MANGA_PATH_PREFIX in parts:
            idx = parts.index(self.MANGA_PATH_PREFIX)
            parts = parts[idx + 1:]
        return "/".join(parts)

    def _parse_listing(self, soup: BeautifulSoup) -> list[MangaDTO]:
        out: list[MangaDTO] = []
        for item in soup.select(self.SEL_LIST_ITEM):
            link = item.select_one(self.SEL_LIST_TITLE)
            cover_el = item.select_one(self.SEL_LIST_COVER)
            if not link:
                continue
            title = self._text(link)
            href = link.get("href", "")
            slug = self._slug_from_url(href)
            cover = self._attr(cover_el, ["data-src", "data-lazy-src", "src"]) if cover_el else ""
            if not slug:
                continue
            out.append(
                MangaDTO(
                    external_id=slug,
                    title=title,
                    url=urljoin(self.base_url, href),
                    cover_url=cover,
                    languages=list(self.languages),
                )
            )
        return out

    def _slug_from_url(self, href: str) -> str:
        if not href:
            return ""
        path = href.split("?", 1)[0].rstrip("/")
        parts = [p for p in path.split("/") if p]
        if self.MANGA_PATH_PREFIX in parts:
            idx = parts.index(self.MANGA_PATH_PREFIX)
            if idx + 1 < len(parts):
                return parts[idx + 1]
        return parts[-1] if parts else ""

    @staticmethod
    def _text(el) -> str:
        return el.get_text(strip=True) if el else ""

    @staticmethod
    def _attr(el, names: list[str]) -> str:
        if not el:
            return ""
        for n in names:
            v = el.get(n)
            if v:
                return v.strip()
        return ""

    @staticmethod
    def _extract_number(text: str) -> float:
        m = re.search(r"(\d+(?:[.,]\d+)?)", text or "")
        if not m:
            return 0.0
        return float(m.group(1).replace(",", "."))

    @staticmethod
    def _normalize_status(raw: str) -> str:
        raw = (raw or "").lower()
        if any(k in raw for k in ("complet", "finaliz", "concluí")):
            return "completed"
        if "hiat" in raw or "pausad" in raw:
            return "hiatus"
        if any(k in raw for k in ("ongoing", "lançament", "em lançamento", "ativo", "publicação")):
            return "ongoing"
        return ""
