# Adicione ao topo
from .models import Manga, Category
import requests

class MangaDexScanner:
    def __init__(self):
        self.api_url = "https://api.mangadex.org/manga"
        # Filtro para mangás que tenham tradução em PT-BR (conforme sua documentação)
        self.base_params = {
            "limit": 20,
            "includes[]": "cover_art", # O segredo para pegar a capa
            "availableTranslatedLanguage[]": "pt-br", # Apenas com conteúdo PT-BR
        }

    def sync_popular_mangas(self):
        """
        Busca os mangás mais populares/seguidos e cadastra no Nexus.
        """
        params = self.base_params.copy()
        params["order[followedCount]"] = "desc" # Ordenar por popularidade

        print("--- INICIANDO VARREDURA DE DESTAQUES MANGADEX ---")
        return self._process_batch(params)

    def sync_latest_updates(self):
        """
        Busca os mangás atualizados recentemente.
        """
        params = self.base_params.copy()
        params["order[latestUploadedChapter]"] = "desc"

        print("--- INICIANDO VARREDURA DE ATUALIZAÇÕES ---")
        return self._process_batch(params)

    def _process_batch(self, params):
        try:
            response = requests.get(self.api_url, params=params)
            response.raise_for_status()
            data = response.json()

            processed_count = 0

            for manga_data in data['data']:
                dex_id = manga_data['id']
                attrs = manga_data['attributes']
                
                # Tratamento de Título (Pode vir em vários idiomas)
                title = attrs['title'].get('en') or attrs['title'].get('ja-ro') or list(attrs['title'].values())[0]
                
                # Tratamento de Descrição
                description = attrs['description'].get('pt-br') or attrs['description'].get('en') or ""
                
                # Lógica da Capa (conforme seu guia)
                cover_filename = ""
                for rel in manga_data['relationships']:
                    if rel['type'] == 'cover_art':
                        cover_filename = rel['attributes']['fileName']
                        break
                
                # Monta a URL da capa (usando a miniatura .256.jpg para performance)
                if cover_filename:
                    cover_url = f"https://uploads.mangadex.org/covers/{dex_id}/{cover_filename}.256.jpg"
                else:
                    cover_url = ""

                # Salvar ou Atualizar no Banco da Arasaka
                manga_obj, created = Manga.objects.update_or_create(
                    mangadex_id=dex_id,
                    defaults={
                        'title': title,
                        'description': description,
                        'cover': cover_url, # Salvamos a URL direta do MangaDex
                        'author': 'Desconhecido', # Autor fica em outro relacionamento, simplificamos por ora
                        'status': attrs.get('status', 'unknown').upper(),
                    }
                )
                
                action = "CRIADO" if created else "ATUALIZADO"
                print(f"[{action}] {title}")
                processed_count += 1

            print(f"--- OPERAÇÃO CONCLUÍDA. {processed_count} MANGÁS PROCESSADOS. ---")
            return True

        except Exception as e:
            print(f"Erro na varredura: {e}")
            return False
        
from .models import Manga, Category, Chapter # <--- Importe Chapter aqui

class MangaDexScanner:
    def __init__(self):
        self.api_url = "https://api.mangadex.org"
        self.base_params = {
            "limit": 50, # Pega 50 por vez
            "includes[]": "cover_art",
            "availableTranslatedLanguage[]": "pt-br",
        }

    # ... (Mantenha os métodos sync_popular_mangas e sync_latest_updates iguais)

    def sync_chapters_for_manga(self, manga_obj):
        """
        Busca a lista de capítulos de um mangá específico e salva no banco.
        NÃO baixa as imagens, apenas cria a lista (Capítulo 1, 2, 3...)
        """
        if not manga_obj.mangadex_id:
            print(f"Pular: {manga_obj.title} não tem ID do MangaDex.")
            return

        print(f"--- BUSCANDO CAPÍTULOS PARA: {manga_obj.title} ---")
        
        # Endpoint específico para o feed de capítulos
        url = f"{self.api_url}/manga/{manga_obj.mangadex_id}/feed"
        
        params = {
            "translatedLanguage[]": "pt-br",
            "order[chapter]": "desc", # Do mais novo para o mais antigo
            "limit": 100, # Tentamos pegar 100 de uma vez
        }

        try:
            # Loop de paginação (caso tenha mais de 100 capítulos)
            offset = 0
            total_synced = 0
            
            while True:
                params["offset"] = offset
                response = requests.get(url, params=params)
                data = response.json()
                
                if not data['data']:
                    break # Acabaram os capítulos

                for ch_data in data['data']:
                    attrs = ch_data['attributes']
                    dex_id = ch_data['id']
                    
                    # Tratamento para capítulos sem número (One-shots)
                    chap_num = attrs['chapter']
                    if not chap_num:
                        chap_num = 0 
                    
                    # Cria ou Atualiza o Capítulo no Nexus
                    Chapter.objects.update_or_create(
                        mangadex_id=dex_id,
                        defaults={
                            'manga': manga_obj,
                            'number': chap_num,
                            'title': attrs['title'] or "",
                            # Não baixamos imagens ainda. O steal_chapter fará isso depois.
                        }
                    )
                    total_synced += 1

                # Prepara próxima página
                offset += 100
                if offset >= data['total']:
                    break

            print(f"-> Sincronizado: {total_synced} capítulos para {manga_obj.title}")

        except Exception as e:
            print(f"Erro ao buscar capítulos de {manga_obj.title}: {e}")

def get_mangadex_pages(mangadex_id):
    """
    Busca as URLs das páginas direto na API do MangaDex sem baixar nada.
    Retorna uma lista de URLs prontas para o Frontend.
    """
    try:
        # 1. Pede ao MangaDex o servidor de imagens para este capítulo
        response = requests.get(f"https://api.mangadex.org/at-home/server/{mangadex_id}")
        response.raise_for_status()
        data = response.json()

        base_url = data['baseUrl']
        chapter_hash = data['chapter']['hash']
        filenames = data['chapter']['data'] # Arquivos de alta qualidade

        # 2. Monta as URLs públicas
        pages = []
        for index, filename in enumerate(filenames):
            # Formato: https://uploads.mangadex.org/data/{hash}/{filename}
            full_url = f"{base_url}/data/{chapter_hash}/{filename}"
            pages.append({
                "id": index, # ID fictício apenas para o React não reclamar
                "image": full_url,
                "order": index
            })
            
        return pages

    except Exception as e:
        print(f"Erro ao buscar páginas online: {e}")
        return []