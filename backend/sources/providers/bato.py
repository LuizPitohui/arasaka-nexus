"""Bato.to (https://bato.to / mto.to) — comunidade global, conteúdo EN top.

Bato não tem API JSON pública oficial, mas o frontend embute dados em
`<script>` tags com payloads JSON. Estratégia:

  - Listagem/busca: parse HTML em /search?word=<q>
  - Detalhes: parse HTML em /title/<id>-<slug>
  - Páginas: cada página de capítulo embute `imgHttps` em script JSON.

Padrão herdado das extensões da família Mihon (multisrc/MangaBox e custom).
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)

_TITLE_ID_RE = re.compile(r"/title/(\d+)")
_CHAPTER_ID_RE = re.compile(r"/chapter/(\d+)")
_IMG_HTTPS_RE = re.compile(r"const\s+imgHttpLis\s*=\s*(\[.*?\])", re.DOTALL)


class BatoSource(BaseSource):
    id = "bato"
    name = "Bato.to"
    base_url = "https://bato.to"
    languages = ["en", "pt-br", "es-la"]
    kind = "scraper"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={"Referer": self.base_url + "/"},
        )

    # ---------- search & detail ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        try:
            resp = self.client.get(
                "/search",
                endpoint="search",
                params={"word": query, "page": page},
            )
        except SourceHTTPError:
            return []
        return self._parse_listing(resp.text)

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(f"/title/{external_id}", endpoint="manga")
        except SourceHTTPError:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        soup = BeautifulSoup(resp.text, "html.parser")
        title_el = soup.select_one("h3.item-title a, h3.nonal-title")
        cover_el = soup.select_one("div.detail-set img")
        desc_el = soup.select_one("div.limit-html")
        return MangaDTO(
            external_id=external_id,
            title=self._text(title_el) or external_id,
            url=urljoin(self.base_url, f"/title/{external_id}"),
            cover_url=(cover_el.get("src") if cover_el else "") or "",
            description=self._text(desc_el),
            languages=list(self.languages),
        )

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        try:
            resp = self.client.get(f"/title/{external_id}", endpoint="chapters")
        except SourceHTTPError:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[ChapterDTO] = []
        for a in soup.select("div.main a.chapt, a.visited.chapt"):
            href = a.get("href", "")
            m = _CHAPTER_ID_RE.search(href)
            if not m:
                continue
            text = self._text(a)
            number = self._extract_number(text)
            out.append(
                ChapterDTO(
                    external_id=m.group(1),
                    number=number,
                    title=text,
                    language="",  # Bato lista todos idiomas misturados; UI filtra depois
                    url=urljoin(self.base_url, href),
                )
            )
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            resp = self.client.get(f"/chapter/{chapter_external_id}", endpoint="pages")
        except SourceHTTPError:
            return []
        m = _IMG_HTTPS_RE.search(resp.text)
        if not m:
            return []
        try:
            urls = json.loads(m.group(1))
        except ValueError:
            return []
        return [
            PageDTO(index=i, url=u, headers={"Referer": self.base_url + "/"})
            for i, u in enumerate(urls)
            if isinstance(u, str)
        ]

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/search",
                endpoint="healthcheck",
                params={"word": "naruto"},
                record_telemetry=False,
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
        latency = int((time.monotonic() - t0) * 1000)
        items = self._parse_listing(resp.text)
        return HealthResult(
            success=resp.status_code < 400,
            latency_ms=latency,
            status_code=resp.status_code,
            extracted_count=len(items),
        )

    # ---------- helpers ----------

    def _parse_listing(self, html: str) -> list[MangaDTO]:
        soup = BeautifulSoup(html, "html.parser")
        out: list[MangaDTO] = []
        for item in soup.select("div#series-list div.col, div.item"):
            link = item.select_one("a.item-cover, a.item-title, h3 a")
            if not link:
                continue
            href = link.get("href", "")
            m = _TITLE_ID_RE.search(href)
            if not m:
                continue
            cover = item.select_one("img")
            out.append(
                MangaDTO(
                    external_id=m.group(1),
                    title=self._text(link) or "(sem título)",
                    url=urljoin(self.base_url, href),
                    cover_url=(cover.get("src") if cover else "") or "",
                    languages=list(self.languages),
                )
            )
        return out

    @staticmethod
    def _text(el) -> str:
        return el.get_text(strip=True) if el else ""

    @staticmethod
    def _extract_number(text: str) -> float:
        m = re.search(r"(\d+(?:[.,]\d+)?)", text or "")
        if not m:
            return 0.0
        return float(m.group(1).replace(",", "."))
