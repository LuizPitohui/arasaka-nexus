from django.contrib import admin
from django.urls import path, include # <--- Não esqueça de importar 'include'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('employees.urls')), # <--- Tudo que começar com 'api/' vai para o app employees
]