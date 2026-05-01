"""Interface BaseSource — contrato que todo provider implementa."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from .dto import ChapterDTO, HealthResult, MangaDTO, PageDTO


class BaseSource(ABC):
    """Contrato comum a APIs e scrapers.

    Atributos de classe (sobrescritos em cada provider):
        id          identificador estável usado em URLs e settings ("mangadex")
        name        nome legível ("MangaDex")
        base_url    URL base do site/API
        languages   lista de códigos suportados ("pt-br", "en")
        kind        "api" | "scraper" | "hybrid"
    """

    id: str = ""
    name: str = ""
    base_url: str = ""
    languages: list[str] = []
    kind: str = "scraper"

    # ---------- discovery & search ----------

    @abstractmethod
    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        """Busca por termo livre. Retorna lista de MangaDTO (pode ser vazia)."""

    @abstractmethod
    def fetch_manga(self, external_id: str) -> MangaDTO:
        """Detalhes completos de uma obra na fonte."""

    @abstractmethod
    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        """Lista capítulos de uma obra (opcionalmente filtrando por idioma)."""

    @abstractmethod
    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        """URLs das páginas de um capítulo na ordem de leitura."""

    # ---------- health ----------

    @abstractmethod
    def healthcheck(self) -> HealthResult:
        """Probe ativo barato. Idealmente endpoint estável que retorna ≥1 item."""

    # ---------- helpers ----------

    @property
    def primary_language(self) -> str:
        return self.languages[0] if self.languages else ""

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} id={self.id}>"
