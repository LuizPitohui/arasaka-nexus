from django.apps import AppConfig


class EmployeesConfig(AppConfig):
    name = 'employees'

    def ready(self):
        # Conecta o signal post_save de Chapter pra disparar push de
        # capitulo novo. Import dentro de ready evita ciclo de import.
        from . import signals  # noqa: F401
