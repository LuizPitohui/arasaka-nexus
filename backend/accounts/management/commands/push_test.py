"""Manda push de teste pra um user (debug VAPID/subscriptions).

Uso:
    python manage.py push_test <username_ou_id>
    python manage.py push_test pitohuikun --title="Olá" --body="Teste"

Quando push_to_user devolve 0, investigar:
  - VAPID configurada? (settings.VAPID_PRIVATE_KEY/PUBLIC_KEY preenchidos)
  - User tem subscription? (PushSubscription.objects.filter(user=...).count())
  - Permissao do browser ainda concedida? (user precisa abrir devtools no
    /profile e checar Notification.permission)
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.models import PushSubscription
from accounts.push import is_configured, send_to_user


class Command(BaseCommand):
    help = "Manda push de teste pra um user (todas as subs dele)."

    def add_arguments(self, parser):
        parser.add_argument("user", help="username ou ID numerico")
        parser.add_argument("--title", default="Arasaka Nexus")
        parser.add_argument("--body", default="Push de teste via management command.")
        parser.add_argument("--url", default="/profile")

    def handle(self, *args, **opts):
        if not is_configured():
            raise CommandError(
                "VAPID nao configurada — preencha VAPID_PRIVATE_KEY/PUBLIC_KEY no .env. "
                "Use 'python manage.py generate_vapid' pra gerar."
            )

        User = get_user_model()
        ident = opts["user"]
        try:
            if ident.isdigit():
                user = User.objects.get(id=int(ident))
            else:
                user = User.objects.get(username=ident)
        except User.DoesNotExist:
            raise CommandError(f"User '{ident}' nao encontrado.")

        subs = PushSubscription.objects.filter(user=user).count()
        if not subs:
            raise CommandError(
                f"User '{user.username}' nao tem nenhuma push subscription. "
                "Pede pra ele ativar em /profile primeiro."
            )

        self.stdout.write(f"Disparando pra {user.username} ({subs} sub(s))...")
        delivered = send_to_user(
            user, title=opts["title"], body=opts["body"], url=opts["url"], tag="cli-test"
        )

        if delivered:
            self.stdout.write(self.style.SUCCESS(
                f"OK — entregue em {delivered}/{subs} dispositivo(s)."
            ))
        else:
            self.stdout.write(self.style.ERROR(
                "Nenhuma entrega. Subs podem ter expirado (limpas automaticamente). "
                "Pede pra user re-ativar push no /profile."
            ))
