from django.core.management.base import BaseCommand
from employees.models import Manga
from employees.services import MangaDexScanner

class Command(BaseCommand):
    help = 'Busca a lista de capitulos para todos os mangas MangaDex'

    def handle(self, *args, **options):
        scanner = MangaDexScanner()

        # Filtra source_id=mangadex pra nao tentar bater no MangaDex API com
        # mangadex_id="mihon:..." (404 garantido). Mihon tem seu proprio
        # caminho de sync via task_mihon_pull_latest + sync_followed_feeds.
        mangas = Manga.objects.filter(source_id="mangadex", mangadex_id__isnull=False)

        self.stdout.write(f"Iniciando sincronizacao de capitulos para {mangas.count()} obras MangaDex...")

        for manga in mangas:
            scanner.sync_chapters_for_manga(manga)

        self.stdout.write(self.style.SUCCESS('Sincronizacao de listas completa!'))