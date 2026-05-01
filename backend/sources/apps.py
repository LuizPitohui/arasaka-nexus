from django.apps import AppConfig


class SourcesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "sources"
    verbose_name = "Fontes externas"

    def ready(self):
        # Importa o registry para que as fontes habilitadas em settings
        # sejam carregadas no startup.
        from . import registry  # noqa: F401
