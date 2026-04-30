from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Contas e Biblioteca"

    def ready(self):
        # Connect signals (auto-create Profile when a User is created)
        from . import signals  # noqa: F401
