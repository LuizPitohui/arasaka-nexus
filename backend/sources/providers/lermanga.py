"""Lermanga (https://lermanga.org) — site Madara genérico em pt-BR."""

from ._madara import MadaraScraper


class LermangaSource(MadaraScraper):
    id = "lermanga"
    name = "Lermanga"
    base_url = "https://lermanga.org"
    languages = ["pt-br"]
