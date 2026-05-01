"""DTOs — formato canônico que toda fonte produz/consome.

Os providers traduzem o formato nativo (JSON da API, HTML scrapeado, protobuf...)
para esses dataclasses. O resto do sistema só conhece esses tipos.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class MangaDTO:
    external_id: str
    title: str
    url: str = ""
    cover_url: str = ""
    description: str = ""
    author: str = ""
    artist: str = ""
    status: str = ""  # "ongoing" | "completed" | "hiatus" | ""
    languages: list[str] = field(default_factory=list)
    alternative_titles: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    content_rating: str = "safe"


@dataclass
class ChapterDTO:
    external_id: str
    number: float
    title: str = ""
    language: str = ""
    scanlator: str = ""
    url: str = ""
    published_at: Optional[datetime] = None


@dataclass
class PageDTO:
    """Uma página dentro de um capítulo."""

    index: int  # 0-based
    url: str
    headers: dict = field(default_factory=dict)  # alguns sites exigem Referer


@dataclass
class HealthResult:
    """Resultado de um probe de saúde."""

    success: bool
    latency_ms: int
    status_code: Optional[int] = None
    error_class: str = ""
    error_message: str = ""
    extracted_count: Optional[int] = None
