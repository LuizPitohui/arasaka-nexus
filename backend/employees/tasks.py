from celery import shared_task
from .services import MangaDexScanner
from .models import Manga
import logging
# Importamos exceções de rede para tratar especificamente
from requests.exceptions import RequestException
import time

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3) # Configura máximo de 3 tentativas extras
def task_import_manga_chapters(self, mangadex_id):
    """
    Tarefa Assíncrona com Auto-Retry (Resiliência).
    Se a API falhar, tenta de novo automaticamente.
    """
    logger.info(f"--- [TASK START] Importando ID: {mangadex_id} (Tentativa {self.request.retries + 1}) ---")
    
    try:
        scanner = MangaDexScanner()
        
        # 1. Busca/Cria o Mangá (Metadados)
        params = {
            "ids[]": [mangadex_id],
            "includes[]": "cover_art",
            "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
        }
        
        # Tenta processar
        success = scanner._process_batch(params)
        
        if not success:
            logger.warning(f"Falha nos metadados para {mangadex_id}. Agendando Retry...")
            # AQUI ESTÁ A MÁGICA:
            # Se falhou, lança uma exceção de Retry para o Celery
            # countdown=30: Espera 30 segundos antes de tentar de novo
            raise self.retry(countdown=30)

        # 2. Busca os Capítulos
        manga = Manga.objects.get(mangadex_id=mangadex_id)
        
        logger.info(f"Sincronizando capítulos para: {manga.title}...")
        scanner.sync_chapters_for_manga(manga)
        
        logger.info(f"--- [TASK FINISH] Sucesso: {manga.title} ---")
        return f"Sucesso: {manga.title}"

    except RequestException as network_error:
        # Se for erro de internet/conexão, retry imediato
        logger.error(f"Erro de Rede: {network_error}. Tentando de novo em 60s...")
        raise self.retry(exc=network_error, countdown=60)

    except Exception as e:
        # Se for um erro desconhecido fatal, apenas loga e desiste
        logger.error(f"Erro fatal não recuperável na task: {str(e)}")
        return f"Erro Fatal: {str(e)}"