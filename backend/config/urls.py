from django.contrib import admin
from django.urls import path, include
# Importe as views do JWT aqui:
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('employees.urls')),
    
    # --- Rotas de Autenticação (Login) ---
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'), # Pega o Token
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'), # Renova o Token
]