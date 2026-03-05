from django.core.management.base import BaseCommand
import requests
from employees.tasks import task_import_manga_chapters
import time
from datetime import datetime

class Command(BaseCommand):
    help = 'Varredura temporal da MangaDex (Máquina do Tempo) para Extração Total'

    def add_arguments(self, parser):
        parser.add_argument(
            '--start-date', 
            type=str, 
            default='2018-01-01T00:00:00', 
            help='Data de início no formato YYYY-MM-DDTHH:MM:SS (Padrão: 2018-01-01T00:00:00)'
        )

    def handle(self, *args, **options):
        # O cursor do tempo. Ele vai avançando conforme lemos os dados.
        current_date_cursor = options['start_date']
        BATCH_SIZE = 100
        
        self.stdout.write(self.style.WARNING(f'--- INICIANDO MÁQUINA DO TEMPO: A PARTIR DE {current_date_cursor} ---'))
        
        total_enviados = 0
        
        while True:
            self.stdout.write(f'>> Viajando no tempo... Buscando 100 mangás criados após: {current_date_cursor}')

            url = "https://api.mangadex.org/manga"
            
            # Os parâmetros da viagem no tempo
            params = {
                "limit": BATCH_SIZE,
                "offset": 0, # O offset agora é sempre 0, pois a data é que empurra a fila
                "availableTranslatedLanguage[]": ["pt-br"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
                "hasAvailableChapters": "true",
                "order[createdAt]": "asc",             # OBRIGATÓRIO: Do mais antigo para o mais novo
                "createdAtSince": current_date_cursor  # OBRIGATÓRIO: A partir desta data
            }

            try:
                response = requests.get(url, params=params, timeout=15)
                
                # Tratamento de escudo contra IP Ban (Rate Limit 429)
                if response.status_code == 429:
                    self.stdout.write(self.style.ERROR('⚠️ Escudo da API ativado (Rate Limit). Resfriando motores por 15 segundos...'))
                    time.sleep(15)
                    continue 
                
                if response.status_code != 200:
                    self.stdout.write(self.style.ERROR(f'Erro Crítico na API: {response.status_code} - {response.text}'))
                    break

                data = response.json()
                mangas = data.get('data', [])

                # Condição de Parada: Se voltar vazio, chegamos no futuro (hoje).
                if not mangas:
                    self.stdout.write(self.style.SUCCESS('*** ALCANÇAMOS O PRESENTE. VARREDURA TOTAL CONCLUÍDA! ***'))
                    break

                # Dispara as tarefas para a Usina (Celery)
                for manga in mangas:
                    task_import_manga_chapters.delay(manga['id'])
                
                count_in_batch = len(mangas)
                total_enviados += count_in_batch
                
                # --- A ENGRENAGEM DA MÁQUINA DO TEMPO ---
                # Pega a data de criação do ÚLTIMO mangá desta lista para ser o ponto de partida da próxima busca.
                last_manga_date_raw = mangas[-1]['attributes']['createdAt']
                
                # O formato que vem é '2018-04-12T14:30:00+00:00'. 
                # Cortamos os milissegundos/timezone para manter o padrão ISO que a API aceita no 'createdAtSince'
                current_date_cursor = last_manga_date_raw[:19] 

                self.stdout.write(self.style.SUCCESS(f'   + {count_in_batch} enviados ao Worker. Total Acumulado: {total_enviados}. Próximo salto: {current_date_cursor}'))

                # Resfriamento obrigatório para manter o respeito com o servidor deles
                time.sleep(1.5) 

            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Falha no Motor Temporal: {str(e)}'))
                self.stdout.write(self.style.WARNING(f'Para continuar de onde parou, rode o comando com: --start-date {current_date_cursor}'))
                break

        self.stdout.write(self.style.SUCCESS(f'--- OPERAÇÃO ENCERRADA. TOTAL DE {total_enviados} MANGÁS NA FILA ---'))