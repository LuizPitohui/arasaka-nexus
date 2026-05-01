"""JWT em HttpOnly cookies — endurece login contra exfiltração via XSS.

Antes (vulneravel): access/refresh em localStorage do navegador. Qualquer
XSS exfiltrava ambos e roubava sessao por 7 dias (REFRESH_TOKEN_LIFETIME).

Agora: tokens viajam APENAS em cookies HttpOnly + Secure + SameSite=Lax.
JS no navegador nao consegue ler. Backend le do cookie automaticamente
(fallback pro header Authorization mantido pra clientes API/curl).

Componentes:

  - CookieJWTAuthentication: classe de auth do DRF que tenta header
    primeiro (curl/postman), depois cookie (browser).

  - CookieTokenObtainPairView: subclasse do TokenObtainPairView que,
    apos validar credenciais, seta os 2 cookies via response.set_cookie
    e enxuga o body pra so {detail: 'ok'} (nao expoe tokens em
    response/logs/devtools).

  - CookieTokenRefreshView: le refresh token do cookie quando o body
    nao traz; rotaciona, seta novo access (e novo refresh quando
    ROTATE_REFRESH_TOKENS=True).

  - apply_login_cookies / clear_login_cookies: helpers reusaveis pra
    register e logout que precisam manipular os mesmos cookies.

CSRF: SameSite=Lax cobre o cenario classico de CSRF (post cross-site
nao envia cookies). Como nao usamos forms HTML que postam cross-origin,
nao precisamos de tokens CSRF separados.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# Re-export do nome do cookie pra mantermos uma fonte de verdade no
# auth_classes.py (que e o modulo plug-in nas REST_FRAMEWORK settings
# e tem que ser leve pra evitar circular import).
from .auth_classes import ACCESS_COOKIE, CookieJWTAuthentication  # noqa: F401

REFRESH_COOKIE = "nexus_refresh"


def _cookie_kwargs(max_age_seconds: int) -> dict:
    return {
        "max_age": max_age_seconds,
        "httponly": True,
        # Secure só em prod (DEBUG=0); em dev local nao queremos forçar HTTPS
        "secure": not settings.DEBUG,
        "samesite": "Lax",
        "path": "/",
    }


def _access_lifetime_seconds() -> int:
    lt = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME", timedelta(minutes=30))
    return int(lt.total_seconds())


def _refresh_lifetime_seconds() -> int:
    lt = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))
    return int(lt.total_seconds())


def apply_login_cookies(response: Response, *, access: str, refresh: str) -> Response:
    """Seta os 2 cookies de auth na response."""
    response.set_cookie(ACCESS_COOKIE, access, **_cookie_kwargs(_access_lifetime_seconds()))
    response.set_cookie(REFRESH_COOKIE, refresh, **_cookie_kwargs(_refresh_lifetime_seconds()))
    return response


def clear_login_cookies(response: Response) -> Response:
    """Apaga os cookies de auth (logout)."""
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")
    return response


class CookieTokenObtainPairView(TokenObtainPairView):
    """Login: apos validar credenciais, seta cookies HttpOnly. Body enxuto."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and isinstance(response.data, dict):
            access = response.data.get("access", "")
            refresh = response.data.get("refresh", "")
            if access and refresh:
                apply_login_cookies(response, access=access, refresh=refresh)
                # Não expomos os tokens no body — cookies cuidam de tudo.
                response.data = {"detail": "authenticated"}
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh: le refresh do cookie se body nao trouxer; seta novo cookie."""

    def post(self, request, *args, **kwargs):
        # Se nao veio refresh no body, tenta o cookie
        if not (request.data or {}).get("refresh"):
            cookie_refresh = request.COOKIES.get(REFRESH_COOKIE)
            if cookie_refresh:
                # mutate via _full_data — DRF aceita
                request._full_data = {"refresh": cookie_refresh}

        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and isinstance(response.data, dict):
            access = response.data.get("access", "")
            new_refresh = response.data.get("refresh", "")  # only present if rotation
            if access:
                response.set_cookie(
                    ACCESS_COOKIE, access, **_cookie_kwargs(_access_lifetime_seconds())
                )
            if new_refresh:
                response.set_cookie(
                    REFRESH_COOKIE,
                    new_refresh,
                    **_cookie_kwargs(_refresh_lifetime_seconds()),
                )
            response.data = {"detail": "refreshed"}
        return response
