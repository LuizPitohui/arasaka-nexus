"""Gera um par de chaves VAPID pra Web Push.

Uso:
    python manage.py generate_vapid

Imprime:
  - VAPID_PRIVATE_KEY (base64 single-line, decode em settings.py)
  - VAPID_PUBLIC_KEY  (base64url)  → backend
  - NEXT_PUBLIC_VAPID_PUBLIC_KEY (igual ao public) → frontend

Roda 1 vez por ambiente. Re-rodar invalida TODAS as subscriptions
existentes (cliente precisa re-subscribe).

Algoritmo: ECDSA P-256, mandatorio pra Web Push.
"""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class Command(BaseCommand):
    help = "Gera VAPID keys (private + public) pra Web Push."

    def handle(self, *args, **options):
        priv = ec.generate_private_key(ec.SECP256R1())
        pub = priv.public_key()

        # Public key: uncompressed point (65 bytes), base64url. Formato
        # esperado pelo Push API no browser e pelo pywebpush.
        pub_bytes = pub.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        pub_b64 = _b64url(pub_bytes)

        # Private em PEM (PKCS#8) — empacotada em base64 single-line pra
        # caber em uma linha de .env / variavel de ambiente Docker sem
        # complicacao de escape de quebras de linha.
        priv_pem = priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        priv_b64 = base64.b64encode(priv_pem).decode("ascii")

        self.stdout.write(self.style.SUCCESS(
            "\n=== VAPID keys geradas ===\n"
        ))
        self.stdout.write(self.style.WARNING(
            "ATENCAO: gerar de novo INVALIDA todas as subscriptions ativas.\n"
            "Backup desses valores em local seguro (cofre/1Password).\n"
        ))

        self.stdout.write("--- backend (.env / .env.prod) ---")
        self.stdout.write(f"VAPID_PUBLIC_KEY={pub_b64}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={priv_b64}")
        self.stdout.write("")
        self.stdout.write("--- frontend (.env / docker-compose ARG) ---")
        self.stdout.write(f"NEXT_PUBLIC_VAPID_PUBLIC_KEY={pub_b64}")
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            "Aplica nos .env, restart backend, rebuild frontend."
        ))
