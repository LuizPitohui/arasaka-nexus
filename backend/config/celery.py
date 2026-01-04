import os
from celery import Celery

# Define as configurações padrão do Django para o Celery
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Cria a aplicação Celery
app = Celery('arasaka')

# Lê as configurações do settings.py (tudo que começar com CELERY_)
app.config_from_object('django.conf:settings', namespace='CELERY')

# Descobre tarefas automaticamente nos apps instalados
app.autodiscover_tasks()