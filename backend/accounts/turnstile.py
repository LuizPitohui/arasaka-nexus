"""Cloudflare Turnstile verification.

Validacao de token de bot-challenge. Usado no /login e /register pra cortar
credential stuffing e account farming antes do request bater no DRF.

Quando settings.TURNSTILE_SECRET_KEY esta vazio (dev local, testes), a
verificacao e desabilitada e devolve True. Isso evita exigir conta
Cloudflare pra rodar o projeto fora de prod.

Tambem extrai o IP real do request respeitando X-Forwarded-For setado pelo
nginx (que ja foi blindado em M1 pra so confiar em proxies internos).
"""

from __future__ import annotations

import logging
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _client_ip(request) -> Optional[str]:
    """IP do cliente respeitando X-Forwarded-For (filtrado pelo nginx).

    O REMOTE_ADDR ja vem reescrito pelo real_ip module quando o request
    veio do cloudflared/docker bridge. Em outros casos eh o IP TCP direto.
    """
    if request is None:
        return None
    return request.META.get("REMOTE_ADDR")


def verify(token: str, *, request=None) -> bool:
    """Valida um token Turnstile contra a Cloudflare.

    Devolve True quando:
      - TURNSTILE_SECRET_KEY esta vazio (modo dev/disabled).
      - Cloudflare aprovou o token.

    Devolve False quando:
      - Token vazio.
      - Cloudflare rejeitou (token invalido, expirado, ja usado).
      - Erro de rede (fail-closed: se nao confirmamos, nao deixa passar).
    """
    secret = settings.TURNSTILE_SECRET_KEY
    if not secret:
        # Disabled em dev — ainda exige token presente pra detectar
        # cedo bugs de integracao no frontend.
        return True

    if not token:
        return False

    payload = {"secret": secret, "response": token}
    ip = _client_ip(request)
    if ip:
        payload["remoteip"] = ip

    try:
        r = requests.post(
            settings.TURNSTILE_VERIFY_URL,
            data=payload,
            timeout=settings.TURNSTILE_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("Turnstile verify falhou (rede): %s", exc)
        return False

    if r.status_code != 200:
        logger.warning("Turnstile verify HTTP %s", r.status_code)
        return False

    try:
        data = r.json()
    except ValueError:
        logger.warning("Turnstile verify devolveu JSON invalido")
        return False

    success = bool(data.get("success"))
    if not success:
        # error-codes: lista de strings com motivos. Util pra debug.
        codes = data.get("error-codes") or []
        logger.info("Turnstile rejeitou token: %s", codes)
    return success
