"""DRF authentication class — separada das Views pra evitar circular import.

settings.REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES aponta pra cá.
Tem que importar SÓ o JWTAuthentication base — qualquer import de Views
do simplejwt nesse arquivo causa import circular durante boot do Django.
"""

from __future__ import annotations

from rest_framework_simplejwt.authentication import JWTAuthentication

# Cookie name compartilhado com auth_jwt (mantido aqui pra evitar
# import cruzado durante o boot).
ACCESS_COOKIE = "nexus_access"


class CookieJWTAuthentication(JWTAuthentication):
    """Aceita JWT do cookie ``nexus_access`` ou do header ``Authorization``.

    Header tem prioridade (compat com curl/postman/clientes mobile).
    Cookie e o caminho default pro browser.
    """

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result
        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if not raw_token:
            return None
        validated = self.get_validated_token(raw_token)
        return self.get_user(validated), validated
