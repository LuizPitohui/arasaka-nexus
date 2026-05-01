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
# Status (verificado em 2026-05-01):
#
# ATIVAS (default):
#   ✅ mangadex    — JSON API oficial, sem rate-limit issues
#   ✅ mangaplus   — JSON API oficial Shueisha (jumpg-webapi)
#
# REATIVAVEIS COM TRABALHO (registradas, fora do default):
#   🔧 asurascans  — site migrou pra Astro/asurascans.com com paths novos.
#                    Provider antigo nao parseia. Reescrita ~1h.
#   🛡️ tsuki      — Cloudflare IUAM. Precisa flaresolverr ou cloudscraper.
#
# DESCONTINUADAS (tiradas do mapa — nao tem como reabilitar daqui):
#   - comick       api.comick.fun nao existe mais; canonical (comick.dev)
#                  esta atras de CF IUAM e DNS sinkholed em redes filtradas.
#   - bato         TCP block do provedor de rede (ConnectTimeout em 443).
#   - lermanga     DNS sinkhole no autoritativo do dominio (-> 127.0.0.1).
#   - brmangas     dominio parqueado (brmangas.net foi vendido).
#   - goldenmangas dominio parqueado (goldenmangas.top foi vendido).
#   Os arquivos de provider permanecem no diretorio para historico/testes,
#   mas nao sao registrados aqui — chamada externa devolve None pelo lookup.
PROVIDER_MAP: dict[str, str] = {
    "mangadex": "sources.providers.mangadex:MangaDexSource",
    "mangaplus": "sources.providers.mangaplus:MangaPlusSource",
    # Reativaveis com trabalho — nao no default
    "asurascans": "sources.providers.asurascans:AsuraScansSource",
    "tsuki": "sources.providers.tsuki:TsukiSource",
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
