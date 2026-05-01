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
#
# Status atual de cada provider (verificado em 2026-05-01):
#   ✅ mangadex    — JSON API oficial, sem rate-limit issues, totalmente funcional
#   ✅ mangaplus   — JSON API oficial Shueisha (jumpg-webapi), sem anti-bot
#   ⚠️  asurascans — site migrou pra Astro em asurascans.com com paths novos;
#                    provider antigo nao parseia o HTML. Precisa reescrita.
#   ❌ comick      — DNS sinkholed em redes que filtram agregadores; canonical
#                    (comick.dev) atras de Cloudflare IUAM (anti-bot). Exige
#                    cloudscraper/headless pra passar.
#   ❌ tsuki       — anti-bot JS (window.location.replace token). Mesmo padrao.
#   ❌ bato        — TCP block (provedor pode bloquear). ConnectTimeout.
#   ❌ lermanga    — DNS sinkhole (resolve para 127.0.0.1).
#   ❌ brmangas    — dominio parqueado (brmangas.net foi vendido).
#   ❌ goldenmangas — dominio parqueado (goldenmangas.top foi vendido).
PROVIDER_MAP: dict[str, str] = {
    "mangadex": "sources.providers.mangadex:MangaDexSource",
    "mangaplus": "sources.providers.mangaplus:MangaPlusSource",
    # Os abaixo estao no mapa para que SOURCES_ENABLED possa habilita-los
    # quando o ambiente permitir, mas estao fora do default.
    "comick": "sources.providers.comick:ComickSource",
    "tsuki": "sources.providers.tsuki:TsukiSource",
    "bato": "sources.providers.bato:BatoSource",
    "asurascans": "sources.providers.asurascans:AsuraScansSource",
    "lermanga": "sources.providers.lermanga:LermangaSource",
    "goldenmangas": "sources.providers.goldenmangas:GoldenmangasSource",
    "brmangas": "sources.providers.brmangas:BrmangasSource",
}


_DEFAULT_ENABLED = ["mangadex", "mangaplus"]

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
