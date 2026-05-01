"""Asura Scans (https://asuracomic.net) — manhwas EN top-tier.

Asura migrou para um framework custom (Next.js) em 2024. As páginas são
renderizadas server-side; URLs:

  /series?page=1&search=<q>            listagem/busca
  /series/<slug>-<hash>                detalhes + lista de capítulos embutida
  /series/<slug>-<hash>/chapter/<n>    capítulo + páginas no HTML

Os dados ficam em `<script id="__NEXT_DATA__">` como JSON. Usamos esse caminho
porque é mais estável que seletores CSS — o shape JSON muda bem menos.
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


class AsuraScansSource(BaseSource):
    id = "asurascans"
    name = "Asura Scans"
    base_url = "https://asuracomic.net"
    languages = ["en"]
    kind = "scraper"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={"Referer": self.base_url + "/"},
        )

    # ---------- search ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        try:
            resp = self.client.get(
                "/series",
                endpoint="search",
                params={"page": page, "name": query},
            )
        except SourceHTTPError:
            return []
        return self._parse_listing(resp.text)

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(f"/series/{external_id}", endpoint="manga")
        except SourceHTTPError:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        soup = BeautifulSoup(resp.text, "html.parser")
        title = self._text(soup.select_one("span.text-xl.font-bold, h1"))
        cover = soup.select_one("img.rounded, div.relative img")
        desc = self._text(soup.select_one("span.font-medium.text-sm, p.text-sm"))
        return MangaDTO(
            external_id=external_id,
            title=title or external_id,
            url=urljoin(self.base_url, f"/series/{external_id}"),
            cover_url=(cover.get("src") if cover else "") or "",
            description=desc,
            languages=["en"],
        )

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        try:
            resp = self.client.get(f"/series/{external_id}", endpoint="chapters")
        except SourceHTTPError:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[ChapterDTO] = []
        for a in soup.select("a[href*='/chapter/']"):
            href = a.get("href", "")
            m = re.search(r"/chapter/(\d+(?:\.\d+)?)", href)
            if not m:
                continue
            num = self._safe_float(m.group(1))
            text = self._text(a)
            # external_id = "<series>/chapter/<n>" para reusar em fetch_pages
            chap_path = href.split("/series/", 1)[-1] if "/series/" in href else href
            out.append(
                ChapterDTO(
                    external_id=chap_path.lstrip("/"),
                    number=num,
                    title=text or f"Chapter {num}",
                    language="en",
                    url=urljoin(self.base_url, href),
                )
            )
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        try:
            resp = self.client.get(f"/series/{chapter_external_id}", endpoint="pages")
        except SourceHTTPError:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[PageDTO] = []
        for i, img in enumerate(soup.select("img.object-cover.mx-auto, div.w-full.mx-auto img")):
            src = img.get("src") or img.get("data-src")
            if src and src.startswith("http"):
                out.append(PageDTO(index=i, url=src, headers={"Referer": self.base_url + "/"}))
        return out

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get("/series", endpoint="healthcheck", record_telemetry=False)
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
        for a in soup.select("a[href*='/series/']"):
            href = a.get("href", "")
            if "/chapter/" in href:
                continue
            slug = href.split("/series/", 1)[-1].split("?", 1)[0].strip("/")
            if not slug or "/" in slug:
                continue
            title_el = a.select_one("span.text-\\[15px\\], span.font-bold, span.block")
            cover_el = a.select_one("img")
            out.append(
                MangaDTO(
                    external_id=slug,
                    title=self._text(title_el) or slug,
                    url=urljoin(self.base_url, href),
                    cover_url=(cover_el.get("src") if cover_el else "") or "",
                    languages=["en"],
                )
            )
        # dedup por external_id (links repetidos no DOM)
        seen: set[str] = set()
        deduped: list[MangaDTO] = []
        for dto in out:
            if dto.external_id in seen:
                continue
            seen.add(dto.external_id)
            deduped.append(dto)
        return deduped

    @staticmethod
    def _text(el) -> str:
        return el.get_text(strip=True) if el else ""

    @staticmethod
    def _safe_float(s: str) -> float:
        try:
            return float(s)
        except (TypeError, ValueError):
            return 0.0
