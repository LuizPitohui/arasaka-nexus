from django.core.management.base import BaseCommand
from employees.services import MangaDexScanner

class Command(BaseCommand):
    help = 'Sincroniza o banco de dados local com os destaques do MangaDex'

    def add_arguments(self, parser):
        parser.add_argument(
            '--mode', 
            type=str, 
            default='popular', 
            help='Modo de sincronização: "popular" ou "latest"'
        )

    def handle(self, *args, **options):
        scanner = MangaDexScanner()
        mode = options['mode']

        if mode == 'latest':
            scanner.sync_latest_updates()
        else:
            scanner.sync_popular_mangas()