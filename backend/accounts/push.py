"""Web Push delivery — wrapper sobre pywebpush.

VAPID_PRIVATE_KEY armazenada como base64 single-line do PEM (gerada
pelo `python manage.py generate_vapid`). A gente decoda 1x na boot e
mantem em memoria — pywebpush aceita PEM bytes direto.


Responsabilidades:
- Montar payload (titulo, body, url) e despachar pra cada subscription
  do usuario (multi-device).
- Tratar 410 Gone / 404 Not Found removendo a subscription do banco
  (endpoint expirou — FCM rotaciona).
- Logar falhas sem propagar exception pra fora (notificacao nao pode
  derrubar a task de import de capitulo).

Quando VAPID_PRIVATE_KEY ou VAPID_PUBLIC_KEY esta vazio (dev sem
chaves), as funcoes sao no-op — frontend pode sequer renderizar o
toggle, mas se chamar, nao quebra.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Iterable

from django.conf import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def _private_key_pem() -> bytes | None:
    """Decoda a chave privada base64 → PEM bytes (cacheada via lru_cache)."""
    raw = settings.VAPID_PRIVATE_KEY
    if not raw:
        return None
    try:
        return base64.b64decode(raw)
    except Exception:
        # Compat: se alguem colou o PEM cru direto na env, devolve as is.
        return raw.encode("utf-8") if isinstance(raw, str) else raw


def send_to_subscription(subscription, payload: dict) -> bool:
    """Despacha 1 push pra 1 endpoint. Devolve True se entregue.

    Em 410/404 deleta a subscription (endpoint morto).
    """
    if not is_configured():
        return False

    # Import lazy: pywebpush traz cryptography/cffi pesado, nao queremos
    # carregar na boot do Django se push esta desabilitado.
    from pywebpush import WebPushException, webpush

    pem = _private_key_pem()
    if not pem:
        return False

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=pem,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=24 * 3600,  # se device offline 24h, descarta
        )
        return True
    except WebPushException as exc:
        # 410 Gone, 404 Not Found = endpoint morto. Limpa do banco.
        status = getattr(exc.response, "status_code", None) if exc.response else None
        if status in (404, 410):
            logger.info(
                "push: endpoint expirado (%s), removendo sub %s",
                status,
                subscription.id,
            )
            subscription.delete()
        else:
            logger.warning(
                "push: falha (%s) pra sub %s: %s",
                status,
                subscription.id,
                exc,
            )
        return False
    except Exception as exc:
        logger.warning("push: erro inesperado pra sub %s: %s", subscription.id, exc)
        return False


def send_to_user(user, *, title: str, body: str, url: str = "/", tag: str = "") -> int:
    """Despacha pra todas as subs do usuario. Devolve quantas entregues."""
    if not is_configured():
        return 0
    payload = {"title": title, "body": body, "url": url}
    if tag:
        payload["tag"] = tag
    sent = 0
    for sub in user.push_subscriptions.all():
        if send_to_subscription(sub, payload):
            sent += 1
    return sent


def send_to_users(
    users: Iterable, *, title: str, body: str, url: str = "/", tag: str = ""
) -> int:
    """Bulk: itera usuarios + suas subscriptions. Devolve total entregue."""
    if not is_configured():
        return 0
    total = 0
    for user in users:
        total += send_to_user(user, title=title, body=body, url=url, tag=tag)
    return total
