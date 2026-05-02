"""Signals do app employees.

post_save em Chapter: dispara notificacao push pros usuarios que
favoritaram o manga, MAS so quando:

  1. created=True (insert, nao update)
  2. published_at recente (< PUSH_NEW_CHAPTER_MAX_AGE_HOURS)

A condicao 2 corta backfill: quando importamos uma obra com 800
capitulos do MangaDex, todos sao 'created=True' simultaneamente, mas
seus published_at sao antigos. Sem a checagem, todo mundo que favoritou
levaria 800 push de uma vez.

A entrega real roda em Celery via transaction.on_commit pra:
  - Nao bloquear o request HTTP / task de import
  - Nao despachar antes do INSERT comitar (race onde a sub-task le
    Chapter.objects.get(id=X) e nao acha ainda)
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Chapter

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Chapter)
def schedule_chapter_push(sender, instance: Chapter, created: bool, **kwargs):
    if not created:
        return

    # Cutoff: ignora capitulos antigos (backfill de obra recem-importada).
    max_age = settings.PUSH_NEW_CHAPTER_MAX_AGE_HOURS
    if not instance.published_at:
        # Sem data upstream — assume recente. release_date (auto_now_add)
        # protege via cutoff diferente: se release_date > 1h atras,
        # tambem skipa (capitulo migrado de outra fonte).
        if instance.release_date and (
            timezone.now() - instance.release_date
        ).total_seconds() > 3600:
            return
    else:
        age_hours = (
            timezone.now() - instance.published_at
        ).total_seconds() / 3600.0
        if age_hours > max_age:
            return

    # Despacha apenas apos o commit da transaction atual. Se o INSERT
    # rolar back, a notificacao nao sai.
    chapter_id = instance.id
    transaction.on_commit(lambda: _enqueue(chapter_id))


def _enqueue(chapter_id: int) -> None:
    # Import lazy: evita ciclo (tasks importa models, signals e
    # carregado no app ready antes de tasks).
    try:
        from .tasks import notify_chapter_new
        notify_chapter_new.delay(chapter_id)
    except Exception as exc:  # nunca derruba o caller
        logger.warning("push: falha enfileirando notify_chapter_new(%s): %s", chapter_id, exc)
