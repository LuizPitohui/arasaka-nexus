"""Site-level configuration: legal documents and contact emails.

Both models are admin-managed singletons/registry. The frontend reads them via
public API (``/api/site/contact/`` and ``/api/site/legal/<slug>/``) so the
operator can update copy and emails without a code deploy.
"""

from django.core.exceptions import ValidationError
from django.db import models


class SiteContact(models.Model):
    """Singleton row holding contact emails surfaced on the site footer."""

    contact_email = models.EmailField(
        default="contato@nexus.arasaka.fun",
        help_text="Caixa geral exibida no footer.",
    )
    dmca_email = models.EmailField(
        default="copyright@nexus.arasaka.fun",
        help_text="Notificações de retirada de conteúdo (notice & takedown).",
    )
    lgpd_email = models.EmailField(
        default="dpo@nexus.arasaka.fun",
        help_text="Encarregado de Dados (LGPD art. 41).",
    )
    support_email = models.EmailField(
        default="suporte@nexus.arasaka.fun",
        help_text="Suporte ao usuário, alteração de cadastro etc.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Contatos do site"
        verbose_name_plural = "Contatos do site"

    def __str__(self):
        return "Contatos do site"

    def save(self, *args, **kwargs):
        # Singleton enforcement: always pk=1
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls) -> "SiteContact":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class LegalDocument(models.Model):
    """Versioned legal copy editable from the admin."""

    SLUG_CHOICES = [
        ("termos", "Termos de Uso"),
        ("privacidade", "Política de Privacidade"),
        ("aviso-legal", "Aviso Legal / Direitos Autorais"),
    ]

    slug = models.SlugField(unique=True, choices=SLUG_CHOICES)
    title = models.CharField(max_length=120)
    body_markdown = models.TextField(
        help_text="Aceita Markdown. Será renderizado no /termos, /privacidade etc.",
    )
    version = models.CharField(
        max_length=20,
        default="1.0",
        help_text="Ex: 1.0, 1.1 — incrementar quando alterar substancialmente.",
    )
    effective_date = models.DateField(
        help_text="Data de vigência exibida no documento.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Documento Legal"
        verbose_name_plural = "Documentos Legais"

    def __str__(self):
        return f"{self.title} (v{self.version})"

    def clean(self):
        if not self.body_markdown.strip():
            raise ValidationError("Conteúdo não pode ficar em branco.")
