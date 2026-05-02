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


_vapid_cache = None


def _vapid() -> "object | None":
    """Devolve uma instancia ``Vapid`` pronta pra usar em pywebpush.

    pywebpush.webpush() aceita o `vapid_private_key` como:
      - dict (claims) → tratado como JWK
      - str → tratado como PATH de arquivo (.encode() interno quebra
        se passarmos bytes do PEM)
      - Vapid object → caminho oficial sem ambiguidade

    A gente decoda o PEM (base64 single-line do .env) UMA vez e cacheia
    o Vapid object pra evitar reparse a cada push.
    """
    global _vapid_cache
    if _vapid_cache is not None:
        return _vapid_cache

    raw = settings.VAPID_PRIVATE_KEY
    if not raw:
        return None

    try:
        pem_bytes = base64.b64decode(raw)
    except Exception:
        # Compat: PEM cru multiline direto na env.
        pem_bytes = raw.encode("ascii") if isinstance(raw, str) else raw

    try:
        from py_vapid import Vapid

        _vapid_cache = Vapid.from_pem(pem_bytes)
        return _vapid_cache
    except Exception as exc:
        logger.error("VAPID: falha carregando chave: %s", exc)
        return None


def send_to_subscription(subscription, payload: dict) -> bool:
    """Despacha 1 push pra 1 endpoint. Devolve True se entregue.

    Em 410/404 deleta a subscription (endpoint morto).
    """
    if not is_configured():
        return False

    # Import lazy: pywebpush traz cryptography/cffi pesado, nao queremos
    # carregar na boot do Django se push esta desabilitado.
    from django.db.models import F
    from django.utils import timezone

    from pywebpush import WebPushException, webpush

    from .models import PushSubscription

    vapid_obj = _vapid()
    if vapid_obj is None:
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
            vapid_private_key=vapid_obj,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=24 * 3600,  # se device offline 24h, descarta
        )
        # Counter agregado pra dashboard. F() = sem race entre workers.
        PushSubscription.objects.filter(pk=subscription.pk).update(
            delivery_count=F("delivery_count") + 1,
            last_delivery_at=timezone.now(),
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
            PushSubscription.objects.filter(pk=subscription.pk).update(
                failure_count=F("failure_count") + 1,
            )
        return False
    except Exception as exc:
        logger.warning("push: erro inesperado pra sub %s: %s", subscription.id, exc)
        PushSubscription.objects.filter(pk=subscription.pk).update(
            failure_count=F("failure_count") + 1,
        )
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
