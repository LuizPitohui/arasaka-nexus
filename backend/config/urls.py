from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

# Branding do Django admin — aparece em /admin/* e nos titles do browser.
admin.site.site_header = "ARASAKA NEXUS"
admin.site.site_title = "Arasaka Nexus Admin"
admin.site.index_title = "// AGENT_DASHBOARD"

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('employees.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/site/', include('site_config.urls')),
    path('api/admin/sources/', include('sources.urls')),

    # Rotas de Autenticação
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Favicon catch-all para rotas que nao passam pelo Next.js (admin, DRF
    # browsable, /api/*). Redireciona pro asset SVG servido pelo frontend.
    path('favicon.ico', RedirectView.as_view(url='/arasaka-mark.svg', permanent=True)),
]

# Serve arquivos de mídia apenas no modo DEBUG (Desenvolvimento)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)