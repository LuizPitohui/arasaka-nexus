"""Concrete Madara providers for Brazilian Portuguese scans.

Estas classes são finas — só configuram base_url, name, languages e marcam
USE_FLARESOLVERR=True porque todos esses sites estão atrás de algum tipo
de anti-bot (Cloudflare IUAM, DDoS-Guard ou similares). A lógica real
está em ``MadaraScraper`` (busca, listagem, capítulos, páginas).

Habilitação:
    1. Subir o serviço FlareSolverr:
        docker compose -f docker-compose.prod.yml --profile antibot up -d
    2. Setar no .env.prod:
        FLARESOLVERR_URL=http://flaresolverr:8191/v1
        SOURCES_ENABLED=mangadex,mangaplus,hunterscomics,luratoon,remangas,...
    3. Restartar backend + celery.

Sem FlareSolverr ativo, essas fontes ficam DOWN no painel — o BaseHTTPClient
gracefully decai para `requests` direto, e os sites devolvem JS challenge
ao invés de HTML real.
"""

from __future__ import annotations

from ._madara import MadaraScraper


class HuntersComicsSource(MadaraScraper):
    id = "hunterscomics"
    name = "Hunters Comics"
    base_url = "https://hunterscomics.com"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True


class LuraToonSource(MadaraScraper):
    id = "luratoon"
    name = "Lura Toon"
    base_url = "https://luratoon.net"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True


class RemangasSource(MadaraScraper):
    id = "remangas"
    name = "Remangas"
    base_url = "https://remangas.org"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True


class LermangasSource(MadaraScraper):
    id = "lermangas"
    name = "Ler Mangas"
    base_url = "https://lermangas.com"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True


class SussyToonsSource(MadaraScraper):
    id = "sussytoons"
    name = "Sussy Toons"
    base_url = "https://www.sussytoons.wtf"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True


class MediocreToonsSource(MadaraScraper):
    id = "mediocretoons"
    name = "Mediocre Toons"
    base_url = "https://mediocretoons.com"
    languages = ["pt-br"]
    USE_FLARESOLVERR = True
