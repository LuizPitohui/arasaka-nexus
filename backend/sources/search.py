"""Busca paralela em todas as fontes ativas.

API simples para o endpoint `/api/search/`:

    multi_source_search(query, *, exclude_dex_ids=None, per_source_timeout=6.0)
        → lista de dicts no formato esperado pela view (cover, title, source...).

Regras:
- Pula fontes em status DOWN (saúde recente).
- Cada fonte tem timeout próprio para que uma lenta não trave a resposta.
- Falhas individuais são logadas mas não derrubam a busca.
- O resultado inclui o campo `source` para o frontend mostrar a origem.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable
from urllib.parse import quote

from . import registry
from .base.dto import MangaDTO
from .base.source import BaseSource
from .models import SourceHealth

logger = logging.getLogger(__name__)


def multi_source_search(
    query: str,
    *,
    exclude_dex_ids: Iterable[str] = (),
    per_source_timeout: float = 6.0,
    max_workers: int = 8,
) -> list[dict]:
    """Roda `source.search(query)` em paralelo nas fontes ativas saudáveis."""
    if not query.strip():
        return []

    excluded = set(exclude_dex_ids or ())
    sources = list(_healthy_sources())
    if not sources:
        return []

    out: list[dict] = []
    seen_external: set[tuple[str, str]] = set()  # (source_id, external_id)

    with ThreadPoolExecutor(max_workers=min(max_workers, len(sources))) as pool:
        future_map = {pool.submit(_safe_search, src, query): src for src in sources}
        for future in as_completed(future_map, timeout=per_source_timeout * len(sources)):
            src = future_map[future]
            try:
                results = future.result(timeout=per_source_timeout)
            except Exception as exc:
                logger.warning("Busca em %s falhou: %s", src.id, exc)
                continue

            for dto in results:
                key = (src.id, dto.external_id)
                if key in seen_external:
                    continue
                seen_external.add(key)

                # Compatibilidade com frontend atual: mantém `mangadex_id` só para
                # MangaDex e, caso ele já apareça no catálogo local com esse id,
                # dropa o duplicado para preservar comportamento existente.
                if src.id == "mangadex":
                    if dto.external_id in excluded:
                        continue
                    out.append(_to_search_payload(dto, src))
                else:
                    out.append(_to_search_payload(dto, src))

    return out


def _healthy_sources() -> Iterable[BaseSource]:
    """Itera sobre fontes ativas, pulando as que estão DOWN."""
    down_ids = set(
        SourceHealth.objects.filter(status=SourceHealth.STATUS_DOWN).values_list("source_id", flat=True)
    )
    for src in registry.iter_active():
        if src.id in down_ids:
            logger.debug("Pulando %s — health=DOWN", src.id)
            continue
        yield src


def _safe_search(src: BaseSource, query: str) -> list[MangaDTO]:
    try:
        return src.search(query) or []
    except Exception as exc:
        logger.warning("source.search(%s) explodiu para %r: %s", src.id, query, exc)
        return []


def _to_search_payload(dto: MangaDTO, src: BaseSource) -> dict:
    """Normaliza um MangaDTO para o shape consumido pelo frontend."""
    cover = dto.cover_url or ""
    # Capas externas que vão por http(s) passam pelo nosso proxy de preview
    # para evitar bloqueio de rede e habilitar cache global no edge.
    if cover.startswith("http"):
        cover = f"/api/cdn/preview/?u={quote(cover, safe='')}"

    payload = {
        "id": dto.external_id,
        "title": dto.title or "(sem título)",
        "cover": cover,
        "in_library": False,
        "source": src.id,
        "external_id": dto.external_id,
        "description": dto.description or "",
        "status": (dto.status or "").upper() or "UNKNOWN",
    }
    # Backwards-compat: o frontend usa `mangadex_id` para decidir o fluxo de
    # import. Só populamos quando a origem é o MangaDex.
    if src.id == "mangadex":
        payload["mangadex_id"] = dto.external_id
    else:
        payload["mangadex_id"] = None
    return payload
