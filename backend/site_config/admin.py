from django.contrib import admin
from django.core.cache import cache

from .models import LegalDocument, SiteContact
from .views import CONTACT_CACHE_KEY, LEGAL_CACHE_KEY


@admin.register(SiteContact)
class SiteContactAdmin(admin.ModelAdmin):
    """Singleton — apenas uma linha existe (pk=1)."""

    list_display = ("contact_email", "dmca_email", "lgpd_email", "support_email", "updated_at")
    readonly_fields = ("updated_at",)
    fieldsets = (
        (
            "Emails de contato",
            {
                "fields": (
                    "contact_email",
                    "dmca_email",
                    "lgpd_email",
                    "support_email",
                ),
                "description": (
                    "Estes emails aparecem no rodapé e nos documentos legais "
                    "(Termos, Privacidade, Aviso Legal). Atualize aqui sempre que "
                    "precisar trocar — nenhuma alteração de código é necessária."
                ),
            },
        ),
        ("Auditoria", {"fields": ("updated_at",)}),
    )

    def has_add_permission(self, request):
        # Singleton: só permite adicionar se ainda não existir.
        return not SiteContact.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(CONTACT_CACHE_KEY)


@admin.register(LegalDocument)
class LegalDocumentAdmin(admin.ModelAdmin):
    list_display = ("slug", "title", "version", "effective_date", "updated_at")
    list_filter = ("slug",)
    search_fields = ("title", "body_markdown")
    readonly_fields = ("updated_at",)
    fieldsets = (
        (None, {"fields": ("slug", "title", "version", "effective_date")}),
        (
            "Conteúdo (Markdown)",
            {
                "fields": ("body_markdown",),
                "description": (
                    "Suporta Markdown básico (títulos, listas, links, negrito). "
                    "O frontend renderiza com sanitização."
                ),
            },
        ),
        ("Auditoria", {"fields": ("updated_at",)}),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(LEGAL_CACHE_KEY.format(slug=obj.slug))
