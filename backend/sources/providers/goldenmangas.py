"""Goldenmangas (https://goldenmangas.top) — site Madara em pt-BR."""

from ._madara import MadaraScraper


class GoldenmangasSource(MadaraScraper):
    id = "goldenmangas"
    name = "Goldenmangas"
    base_url = "https://goldenmangas.top"
    languages = ["pt-br"]
    # Goldenmangas usa /mangabr/ em vez de /manga/ em algumas seções.
    # Mantemos o default e ajustamos se quebrar via tests.
