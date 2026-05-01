"""Public read-only endpoints for legal documents and site contact info.

Both are cached in Redis since they change rarely; updates from the admin
invalidate the cache via ``post_save`` signals.
"""

from django.core.cache import cache
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import LegalDocument, SiteContact

CONTACT_CACHE_KEY = "site:contact"
LEGAL_CACHE_KEY = "site:legal:{slug}"
CACHE_TTL = 300  # 5min


@api_view(["GET"])
@permission_classes([AllowAny])
def contact(request):
    cached = cache.get(CONTACT_CACHE_KEY)
    if cached is not None:
        return Response(cached)
    obj = SiteContact.get_solo()
    payload = {
        "contact_email": obj.contact_email,
        "dmca_email": obj.dmca_email,
        "lgpd_email": obj.lgpd_email,
        "support_email": obj.support_email,
    }
    cache.set(CONTACT_CACHE_KEY, payload, CACHE_TTL)
    return Response(payload)


@api_view(["GET"])
@permission_classes([AllowAny])
def legal_document(request, slug: str):
    cache_key = LEGAL_CACHE_KEY.format(slug=slug)
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    doc = get_object_or_404(LegalDocument, slug=slug)
    payload = {
        "slug": doc.slug,
        "title": doc.title,
        "body_markdown": doc.body_markdown,
        "version": doc.version,
        "effective_date": doc.effective_date.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
    }
    cache.set(cache_key, payload, CACHE_TTL)
    return Response(payload)
