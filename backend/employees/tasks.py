from celery import shared_task
from .services import MangaDexScanner
from .models import Manga
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True)
def task_import_manga_chapters(self, mangadex_id):
    """
    Tarefa Assíncrona: Baixa mangá e capítulos em background.
    Não trava o navegador do usuário.
    """
    logger.info(f"--- [TASK START] Iniciando importação para ID: {mangadex_id} ---")
    
    try:
        scanner = MangaDexScanner()
        
        # 1. Busca/Cria o Mangá (Metadados)
        params = {
            "ids[]": [mangadex_id],
            "includes[]": "cover_art",
            "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"],
        }
        success = scanner._process_batch(params)
        
        if not success:
            logger.error(f"Falha ao importar metadados para {mangadex_id}")
            return "Falha nos Metadados"

        # 2. Busca os Capítulos (A parte demorada)
        # Recupera o objeto criado no passo anterior
        manga = Manga.objects.get(mangadex_id=mangadex_id)
        
        logger.info(f"Sincronizando capítulos para: {manga.title}...")
        scanner.sync_chapters_for_manga(manga)
        
        logger.info(f"--- [TASK FINISH] Importação concluída: {manga.title} ---")
        return f"Sucesso: {manga.title}"

    except Exception as e:
        logger.error(f"Erro fatal na task: {str(e)}")
        # Em caso de erro, podemos tentar de novo automaticamente (Retry)
        # self.retry(exc=e, countdown=60) 
        return f"Erro: {str(e)}"