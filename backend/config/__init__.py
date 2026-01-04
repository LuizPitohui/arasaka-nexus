# Importa o app do Celery para que ele seja carregado quando o Django iniciar
from .celery import app as celery_app

__all__ = ('celery_app',)