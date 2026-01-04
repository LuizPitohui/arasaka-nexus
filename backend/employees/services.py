import requests
from .models import Manga, Category, Chapter

# --- FUNÇÃO INDEPENDENTE PARA O LEITOR ---
def get_mangadex_pages(mangadex_id):
    """
    Busca as URLs das páginas direto na API do MangaDex sem baixar nada.
    Usada pelo endpoint de leitura (Streaming).
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
                "id": index, 
                "image": full_url,
                "order": index
            })
            
        return pages

    except Exception as e:
        print(f"Erro ao buscar páginas online: {e}")
        return []


# --- A CLASSE DE INTELIGÊNCIA ---
class MangaDexScanner:
    def __init__(self):
        self.api_url = "https://api.mangadex.org"
        self.base_params = {
            "limit": 20, 
            "includes[]": "cover_art",
            # ATUALIZADO: Aceita PT-BR e Inglês para evitar mangás vazios
            "availableTranslatedLanguage[]": ["pt-br", "en"], 
        }

    def search_manga(self, query):
        """
        Busca mangás no MangaDex pelo nome (Para a barra de pesquisa).
        Retorna uma lista de dicionários formatados.
        """
        print(f"--- BUSCANDO NO MANGADEX: {query} ---")
        
        # Parâmetros específicos da busca
        params = {
            "title": query,
            "limit": 12,
            "includes[]": "cover_art",
            "availableTranslatedLanguage[]": ["pt-br", "en"],
            "order[followedCount]": "desc" # Prioriza os famosos
        }

        try:
            response = requests.get(f"{self.api_url}/manga", params=params)
            response.raise_for_status()
            data = response.json()
            
            results = []
            for manga_data in data['data']:
                dex_id = manga_data['id']
                attrs = manga_data['attributes']
                
                # Tratamento de Título
                title = attrs['title'].get('en') or attrs['title'].get('ja-ro') or list(attrs['title'].values())[0]
                
                # Tratamento de Capa
                cover_filename = ""
                for rel in manga_data['relationships']:
                    if rel['type'] == 'cover_art':
                        cover_filename = rel['attributes']['fileName']
                        break
                
                cover_url = f"https://uploads.mangadex.org/covers/{dex_id}/{cover_filename}.256.jpg" if cover_filename else ""
                
                results.append({
                    "mangadex_id": dex_id,
                    "title": title,
                    "description": attrs['description'].get('pt-br') or attrs['description'].get('en') or "",
                    "cover": cover_url,
                    "author": "Desconhecido",
                    "status": attrs.get('status', 'unknown').upper()
                })
            
            return results

        except Exception as e:
            print(f"Erro na busca: {e}")
            return []

    def sync_popular_mangas(self):
        """
        Busca os mangás mais populares/seguidos e cadastra no Nexus.
        """
        params = self.base_params.copy()
        params["order[followedCount]"] = "desc"

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

    def sync_chapters_for_manga(self, manga_obj):
        """
        Busca a lista de capítulos. 
        ATUALIZADO: Agora busca conteúdo 'Safe', 'Suggestive', 'Erotica' e 'Pornographic'.
        """
        if not manga_obj.mangadex_id:
            print(f"Pular: {manga_obj.title} não tem ID do MangaDex.")
            return

        print(f"--- BUSCANDO CAPÍTULOS PARA: {manga_obj.title} ---")
        
        url = f"{self.api_url}/manga/{manga_obj.mangadex_id}/feed"
        
        params = {
            # Idiomas
            "translatedLanguage[]": ["pt-br", "en"],
            
            # ORDEM: Do mais recente para o mais antigo (facilita pegar atualizações)
            "order[chapter]": "desc",
            
            # FILTRO DE CONTEÚDO (O Segredo do conserto)
            # Se não passar isso, o MangaDex esconde mangás 'Suggestive'
            "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
            
            "limit": 500, # Aumentei o limite para pegar mais de uma vez
        }

        try:
            # Loop simples para paginação (caso tenha mais de 500 capítulos)
            offset = 0
            total_synced = 0
            
            while True:
                params["offset"] = offset
                response = requests.get(url, params=params)
                data = response.json()
                
                if not data['data']:
                    break

                for ch_data in data['data']:
                    attrs = ch_data['attributes']
                    dex_id = ch_data['id']
                    
                    chap_num = attrs['chapter']
                    # Tratamento para one-shots ou capítulos sem número
                    if not chap_num:
                        chap_num = 0 
                    
                    Chapter.objects.update_or_create(
                        mangadex_id=dex_id,
                        defaults={
                            'manga': manga_obj,
                            'number': chap_num,
                            'title': attrs['title'] or "",
                        }
                    )
                    total_synced += 1

                if total_synced >= data['total']:
                    break
                
                offset += 500
                if offset >= 10000: # Trava de segurança
                    break

            print(f"-> Sincronizado: {total_synced} capítulos para {manga_obj.title}")

        except Exception as e:
            print(f"Erro ao buscar capítulos de {manga_obj.title}: {e}")




    def _process_batch(self, params):
        """
        Método interno auxiliar para processar listas de mangás.
        Atualizado para incluir Categorias e Sincronização Automática.
        """
        try:
            response = requests.get(f"{self.api_url}/manga", params=params)
            response.raise_for_status()
            data = response.json()

            processed_count = 0

            for manga_data in data['data']:
                dex_id = manga_data['id']
                attrs = manga_data['attributes']
                
                # Tratamento de Título
                title = attrs['title'].get('en') or attrs['title'].get('ja-ro') or list(attrs['title'].values())[0]
                
                # Tratamento de Descrição
                description = attrs['description'].get('pt-br') or attrs['description'].get('en') or ""
                
                # Tratamento de Capa
                cover_filename = ""
                for rel in manga_data['relationships']:
                    if rel['type'] == 'cover_art':
                        cover_filename = rel['attributes']['fileName']
                        break
                
                if cover_filename:
                    cover_url = f"https://uploads.mangadex.org/covers/{dex_id}/{cover_filename}.256.jpg"
                else:
                    cover_url = ""

                # 1. Cria ou Atualiza o Mangá
                manga_obj, created = Manga.objects.update_or_create(
                    mangadex_id=dex_id,
                    defaults={
                        'title': title,
                        'description': description,
                        'cover': cover_url,
                        'status': attrs.get('status', 'unknown').upper(),
                    }
                )

                # 2. NOVO: Processamento de Categorias (Tags)
                # Isso permite que você filtre por "Ação", "Terror", etc. depois.
                if 'tags' in attrs:
                    for tag in attrs['tags']:
                        tag_name = tag['attributes']['name']['en']
                        # Cria a categoria se não existir
                        category_obj, _ = Category.objects.get_or_create(
                            name=tag_name,
                            defaults={'slug': tag_name.lower().replace(' ', '-')}
                        )
                        # Adiciona a categoria ao mangá
                        manga_obj.categories.add(category_obj)
                
                # 3. Se criou um mangá novo, já busca a lista de capítulos imediatamente
                if created:
                    self.sync_chapters_for_manga(manga_obj)

                processed_count += 1

            print(f"--- OPERAÇÃO CONCLUÍDA. {processed_count} MANGÁS PROCESSADOS. ---")
            return True

        except Exception as e:
            print(f"Erro na varredura: {e}")
            return False    