from django.core.management.base import BaseCommand
from employees.models import Manga
from employees.services import MangaDexScanner

class Command(BaseCommand):
    help = 'Busca a lista de capítulos para todos os mangás do sistema'

    def handle(self, *args, **options):
        scanner = MangaDexScanner()
        
        # Pega todos os mangás que têm ID do MangaDex
        mangas = Manga.objects.filter(mangadex_id__isnull=False)
        
        self.stdout.write(f"Iniciando sincronização de capítulos para {mangas.count()} obras...")
        
        for manga in mangas:
            scanner.sync_chapters_for_manga(manga)
            
        self.stdout.write(self.style.SUCCESS('Sincronização de listas completa!'))