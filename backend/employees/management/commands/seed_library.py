from django.core.management.base import BaseCommand
import requests
from employees.tasks import task_import_manga_chapters
import time
import sys

class Command(BaseCommand):
    help = 'Semeia o banco de dados com mangás populares (Paginação Automática)'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100, help='Total de mangás para buscar')
        parser.add_argument('--offset', type=int, default=0, help='Começar a partir de qual posição')

    def handle(self, *args, **options):
        total_target = options['limit']
        current_offset = options['offset']
        
        # A API da MangaDex limita a 100 por requisição.
        # Nós faremos chamadas em lotes de 100 até atingir o seu 'limit'.
        BATCH_SIZE = 100 
        
        self.stdout.write(self.style.WARNING(f'--- INICIANDO PROTOCOLO SEED (ALVO: {total_target}) ---'))
        
        processed_count = 0
        
        while processed_count < total_target:
            # Define o tamanho do lote atual (pode ser menor que 100 na última rodada)
            current_limit = min(BATCH_SIZE, total_target - processed_count)
            
            self.stdout.write(f'>> Buscando lote de {current_limit} (Offset atual: {current_offset})...')

            url = "https://api.mangadex.org/manga"
            params = {
                "limit": current_limit,
                "offset": current_offset,
                "availableTranslatedLanguage[]": ["pt-br"],
                "order[followedCount]": "desc",
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
                "hasAvailableChapters": "true"
            }

            try:
                response = requests.get(url, params=params, timeout=10)
                
                if response.status_code == 429:
                    self.stdout.write(self.style.ERROR('Rate Limit atingido! Pausando por 5 segundos...'))
                    time.sleep(5)
                    continue # Tenta de novo o mesmo lote
                
                if response.status_code != 200:
                    self.stdout.write(self.style.ERROR(f'Erro na API: {response.status_code}'))
                    break

                data = response.json()
                mangas = data.get('data', [])

                if not mangas:
                    self.stdout.write(self.style.WARNING('Fim da lista da MangaDex. Nenhum item restante.'))
                    break

                # Envia para o Celery
                for manga in mangas:
                    manga_title = manga['attributes']['title'].get('en') or list(manga['attributes']['title'].values())[0]
                    # print(f"Disparando: {manga_title}") # Comentado para não poluir o terminal
                    task_import_manga_chapters.delay(manga['id'])

                count_in_batch = len(mangas)
                processed_count += count_in_batch
                current_offset += count_in_batch
                
                self.stdout.write(self.style.SUCCESS(f'   + {count_in_batch} disparados. Total: {processed_count}/{total_target}'))

                # Pausa estratégica para não tomar Ban da API
                time.sleep(1) 

            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Erro fatal no loop: {str(e)}'))
                break

        self.stdout.write(self.style.SUCCESS(f'--- OPERAÇÃO FINALIZADA. {processed_count} MANGÁS ENVIADOS AO WORKER ---'))