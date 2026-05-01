import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="SiteContact",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "contact_email",
                    models.EmailField(
                        default="contato@nexus.arasaka.fun",
                        help_text="Caixa geral exibida no footer.",
                        max_length=254,
                    ),
                ),
                (
                    "dmca_email",
                    models.EmailField(
                        default="copyright@nexus.arasaka.fun",
                        help_text="Notificações de retirada de conteúdo (notice & takedown).",
                        max_length=254,
                    ),
                ),
                (
                    "lgpd_email",
                    models.EmailField(
                        default="dpo@nexus.arasaka.fun",
                        help_text="Encarregado de Dados (LGPD art. 41).",
                        max_length=254,
                    ),
                ),
                (
                    "support_email",
                    models.EmailField(
                        default="suporte@nexus.arasaka.fun",
                        help_text="Suporte ao usuário, alteração de cadastro etc.",
                        max_length=254,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Contatos do site",
                "verbose_name_plural": "Contatos do site",
            },
        ),
        migrations.CreateModel(
            name="LegalDocument",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "slug",
                    models.SlugField(
                        choices=[
                            ("termos", "Termos de Uso"),
                            ("privacidade", "Política de Privacidade"),
                            ("aviso-legal", "Aviso Legal / Direitos Autorais"),
                        ],
                        unique=True,
                    ),
                ),
                ("title", models.CharField(max_length=120)),
                (
                    "body_markdown",
                    models.TextField(
                        help_text="Aceita Markdown. Será renderizado no /termos, /privacidade etc."
                    ),
                ),
                (
                    "version",
                    models.CharField(
                        default="1.0",
                        help_text="Ex: 1.0, 1.1 — incrementar quando alterar substancialmente.",
                        max_length=20,
                    ),
                ),
                (
                    "effective_date",
                    models.DateField(help_text="Data de vigência exibida no documento."),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Documento Legal",
                "verbose_name_plural": "Documentos Legais",
            },
        ),
    ]
