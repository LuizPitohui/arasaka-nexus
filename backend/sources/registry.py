"""Registry de fontes ativas.

Cada provider é uma classe `BaseSource` registrada aqui. O registry oferece:

  - Discovery: `iter_active()` retorna instâncias das fontes ativas.
  - Lookup: `get(source_id)` devolve uma fonte específica.
  - Singleton: instâncias são cacheadas (são leves e thread-safe se a sessão
    HTTP do `requests` for usada de forma read-mostly).

Quais fontes ficam ativas é controlado por `settings.SOURCES_ENABLED`. Se não
estiver definido, usa um conjunto-padrão seguro.
"""

from __future__ import annotations

import importlib
import logging
from typing import Iterable, Optional

from django.conf import settings

from .base.source import BaseSource

logger = logging.getLogger(__name__)


# Mapa estático: id → "module:Class". Adicionar um provider novo é uma linha aqui.
PROVIDER_MAP: dict[str, str] = {
    # Top-tier (qualidade de conteúdo + cobertura)
    "mangadex": "sources.providers.mangadex:MangaDexSource",
    "comick": "sources.providers.comick:ComickSource",
    "tsuki": "sources.providers.tsuki:TsukiSource",
    "bato": "sources.providers.bato:BatoSource",
    "asurascans": "sources.providers.asurascans:AsuraScansSource",
    "mangaplus": "sources.providers.mangaplus:MangaPlusSource",
    # Madara genéricos (BR)
    "lermanga": "sources.providers.lermanga:LermangaSource",
    "goldenmangas": "sources.providers.goldenmangas:GoldenmangasSource",
    "brmangas": "sources.providers.brmangas:BrmangasSource",
}


_DEFAULT_ENABLED = ["mangadex", "comick"]

_instances: dict[str, BaseSource] = {}


def _enabled_ids() -> list[str]:
    return list(getattr(settings, "SOURCES_ENABLED", _DEFAULT_ENABLED))


def _load(source_id: str) -> Optional[BaseSource]:
    if source_id in _instances:
        return _instances[source_id]
    spec = PROVIDER_MAP.get(source_id)
    if not spec:
        logger.warning("Source %s não está em PROVIDER_MAP", source_id)
        return None
    module_path, class_name = spec.split(":")
    try:
        mod = importlib.import_module(module_path)
        cls = getattr(mod, class_name)
        instance = cls()
    except Exception:
        logger.exception("Falha ao instanciar provider %s", source_id)
        return None
    _instances[source_id] = instance
    return instance


def get(source_id: str) -> Optional[BaseSource]:
    return _load(source_id)


def iter_active() -> Iterable[BaseSource]:
    for sid in _enabled_ids():
        inst = _load(sid)
        if inst is not None:
            yield inst


def all_known_ids() -> list[str]:
    return list(PROVIDER_MAP.keys())


def reset_cache() -> None:
    """Útil para testes."""
    _instances.clear()
