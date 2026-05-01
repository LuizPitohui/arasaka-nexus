"""Brmangas (https://brmangas.net) — site Madara em pt-BR."""

from ._madara import MadaraScraper


class BrmangasSource(MadaraScraper):
    id = "brmangas"
    name = "Brmangas"
    base_url = "https://brmangas.net"
    languages = ["pt-br"]
