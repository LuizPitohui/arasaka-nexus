"""MangaPlus by Shueisha (https://mangaplus.shueisha.co.jp).

Catálogo OFICIAL de mangás Shueisha (One Piece, Jujutsu Kaisen, Kagurabachi,
Sakamoto Days, Spy x Family, etc.). Conteúdo legalmente publicado, em
inglês/espanhol/português/etc, gratuito (com janela: primeiros + últimos 3
capítulos costumam ser livres).

Estado deste provider:
  ✅ Search/listagem/detalhes via HTML público (mangaplus.shueisha.co.jp)
  ⚠️ Páginas (`fetch_pages`) requer parsing protobuf — `jumpg-webapi.tokyo-cdn.com`
     responde com Content-Type: application/octet-stream e payload em
     protobuf. As extensões do Mihon resolvem isso compilando um conjunto de
     `.proto` (https://github.com/keiyoushi/extensions/tree/main/src/all/mangaplus)
     mais um XOR leve nas URLs finais.

Para entregar o provider hoje em modo "discovery only" (search/detail/chapters),
deixamos `fetch_pages` retornando `[]` com TODO. Isso é suficiente pra:
  - aparecer nos resultados da busca
  - alimentar o painel de saúde
  - sinalizar ao usuário que existe na fonte oficial

Próximo passo dedicado: adicionar `protobuf` ao pyproject + copiar os `.proto`
do upstream Mihon e gerar o stub Python. ~2h de trabalho.
"""

from __future__ import annotations

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

_TITLE_ID_RE = re.compile(r"/titles/(\d+)")


class MangaPlusSource(BaseSource):
    id = "mangaplus"
    name = "MangaPlus (Shueisha)"
    base_url = "https://mangaplus.shueisha.co.jp"
    languages = ["en", "es-la", "pt-br", "ru", "fr", "id", "vi", "th"]
    kind = "hybrid"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.base_url,
            default_headers={"Referer": self.base_url + "/"},
        )

    # ---------- search ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        # MangaPlus não tem busca por título via HTML público; a busca real
        # está em jumpg-webapi.tokyo-cdn.com (protobuf). Por ora trazemos a
        # listagem completa de títulos disponíveis e filtramos no cliente.
        try:
            resp = self.client.get("/manga_list/all", endpoint="search")
        except SourceHTTPError:
            return []
        all_titles = self._parse_listing(resp.text)
        if not query:
            return all_titles
        ql = query.lower()
        return [t for t in all_titles if ql in t.title.lower()]

    def fetch_manga(self, external_id: str) -> MangaDTO:
        try:
            resp = self.client.get(f"/titles/{external_id}", endpoint="manga")
        except SourceHTTPError:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        soup = BeautifulSoup(resp.text, "html.parser")
        title_el = soup.select_one("h1, .title-name")
        cover_el = soup.select_one("img.title-image, img.cover")
        desc_el = soup.select_one("p.title-overview, .overview")
        return MangaDTO(
            external_id=external_id,
            title=self._text(title_el) or external_id,
            url=urljoin(self.base_url, f"/titles/{external_id}"),
            cover_url=(cover_el.get("src") if cover_el else "") or "",
            description=self._text(desc_el),
            languages=list(self.languages),
        )

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        # Lista mínima a partir do HTML — protobuf traz mais detalhes.
        try:
            resp = self.client.get(f"/titles/{external_id}", endpoint="chapters")
        except SourceHTTPError:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[ChapterDTO] = []
        for a in soup.select("a[href*='/viewer/']"):
            href = a.get("href", "")
            m = re.search(r"/viewer/(\d+)", href)
            if not m:
                continue
            text = self._text(a)
            number = self._extract_number(text)
            out.append(
                ChapterDTO(
                    external_id=m.group(1),
                    number=number,
                    title=text,
                    language="en",
                    url=urljoin(self.base_url, href),
                )
            )
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        # TODO(mangaplus-protobuf): integrar parsing protobuf para
        # jumpg-webapi.tokyo-cdn.com/api/manga_viewer?chapter_id=<id>&split=yes&img_quality=high
        # mais o XOR leve nas URLs finais (key vem na própria resposta).
        # Depende do pacote `protobuf` + .proto compilados (ver docstring do módulo).
        logger.info("MangaPlus: fetch_pages ainda requer integração protobuf")
        return []

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        try:
            resp = self.client.get(
                "/manga_list/all",
                endpoint="healthcheck",
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
        for a in soup.select("a[href*='/titles/']"):
            href = a.get("href", "")
            m = _TITLE_ID_RE.search(href)
            if not m:
                continue
            title_el = a.select_one(".title-name, .item-title, span")
            cover_el = a.select_one("img")
            title = self._text(title_el) or self._text(a)
            if not title:
                continue
            out.append(
                MangaDTO(
                    external_id=m.group(1),
                    title=title,
                    url=urljoin(self.base_url, href),
                    cover_url=(cover_el.get("src") if cover_el else "") or "",
                    languages=list(self.languages),
                )
            )
        # dedup por id (a listagem repete o mesmo título em várias seções)
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
    def _extract_number(text: str) -> float:
        m = re.search(r"(\d+(?:[.,]\d+)?)", text or "")
        if not m:
            return 0.0
        return float(m.group(1).replace(",", "."))
