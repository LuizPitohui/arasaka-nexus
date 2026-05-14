import threading

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Profile, ReadingProgress, ScoreEvent, Season, UserSeasonStats
from .ranking import (
    MIN_READ_SECONDS_FOR_POINTS,
    POINTS_CHAPTER,
    POINTS_WORK_BONUS_PER_CHAPTER,
    rank_for_score,
    reading_time_points,
)


# Thread-local "no-score" flag. Quando setado pra True (via context manager
# scoring_disabled() ou skip_scoring()), o signal handler de ReadingProgress
# nao gera ScoreEvent. Usado pelo bulk endpoint pra permitir que o user
# alinhe estado de leitura (ex: migrou do Mihon) sem inflar score.
_score_gate = threading.local()


def scoring_is_disabled() -> bool:
    return bool(getattr(_score_gate, "disabled", False))


class skip_scoring:
    """Context manager: dentro do bloco, post_save de ReadingProgress nao
    cria ScoreEvent. Usar em writes em lote / ajustes administrativos /
    backfills onde o user nao "leu" de verdade."""

    def __enter__(self):
        self._prev = getattr(_score_gate, "disabled", False)
        _score_gate.disabled = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        _score_gate.disabled = self._prev
        return False


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)


# ---------------------------------------------------------------------------
# Ranking: emite ScoreEvents quando o user marca capítulo como lido.
# ---------------------------------------------------------------------------
@receiver(post_save, sender=ReadingProgress)
def award_score_on_completion(sender, instance: ReadingProgress, **kwargs):
    """Dispara em todo save de ReadingProgress, mas só age quando o capítulo
    está concluído.

    Idempotente em DOIS niveis:
      1. ScoreEvent tem unique constraint por (user, season, kind, ref_id) —
         saves repetidos do MESMO capitulo nao dao pontos extras
      2. Pra capitulos em variantes do mesmo Work (mesma obra de fontes
         diferentes), checamos se qualquer chapter "irmao" (mesmo work_id +
         mesmo chapter.number) ja tem ScoreEvent na season — se sim, skip
         awarding. Sem isso, ler cap 10 numa fonte e depois ler cap 10
         em outra variante daria pontos em DOBRO pela mesma leitura.
    """
    if not instance.completed:
        return

    # Bulk endpoint / admin actions / backfills passam por aqui sem dar
    # pontos. O estado de "lido" e persistido normalmente.
    if scoring_is_disabled():
        return

    season = Season.current()
    if season is None:
        # Sem season ativa (instalação nova antes do seed). Silenciosamente
        # não pontua — quando a season for criada, capítulos futuros pontuam.
        return

    # Anti-farm: o user precisa ter ficado um tempo minimo entre abrir o
    # capitulo e marcar como lido. Capitulos abertos+marcados em <30s sao
    # tratados como skim — estado de leitura registra, mas nao gera pontos.
    # ``created_at`` e auto_now_add (nullable so em rows legadas pre-0008).
    if instance.created_at:
        elapsed = (instance.updated_at - instance.created_at).total_seconds()
        if elapsed < MIN_READ_SECONDS_FOR_POINTS:
            return

    user_id = instance.user_id
    chapter_id = instance.chapter_id

    # Calcula sibling chapter_ids (mesmo Work, mesmo number). Inclui o
    # proprio chapter_id como caso degenerado.
    from employees.models import Chapter

    chapter = (
        Chapter.objects.filter(id=chapter_id)
        .values("id", "manga_id", "manga__work_id", "number")
        .first()
    )
    if not chapter:
        return

    work_id = chapter["manga__work_id"]
    chapter_number = chapter["number"]
    manga_id = chapter["manga_id"]

    if work_id:
        sibling_chapter_ids = list(
            Chapter.objects.filter(
                manga__work_id=work_id, number=chapter_number
            ).values_list("id", flat=True)
        )
        sibling_manga_ids = list(
            Chapter.objects.filter(
                manga__work_id=work_id, number=chapter_number
            ).values_list("manga_id", flat=True).distinct()
        )
        # Pro work_complete bonus precisamos das variantes inteiras do Work
        from employees.models import Manga

        all_work_manga_ids = list(
            Manga.objects.filter(work_id=work_id).values_list("id", flat=True)
        )
    else:
        sibling_chapter_ids = [chapter_id]
        sibling_manga_ids = [manga_id]
        all_work_manga_ids = [manga_id]

    with transaction.atomic():
        stats, _ = UserSeasonStats.objects.select_for_update().get_or_create(
            user_id=user_id, season=season
        )

        # 1) Pontos por capítulo lido — dedup at Work-chapter-number level
        chapter_event_exists = ScoreEvent.objects.filter(
            user_id=user_id,
            season=season,
            kind=ScoreEvent.KIND_CHAPTER,
            ref_id__in=sibling_chapter_ids,
        ).exists()
        delta = 0
        if not chapter_event_exists:
            ScoreEvent.objects.create(
                user_id=user_id,
                season=season,
                kind=ScoreEvent.KIND_CHAPTER,
                ref_id=chapter_id,
                points=POINTS_CHAPTER,
            )
            delta += POINTS_CHAPTER

        # 2) Pontos por tempo de leitura (delta updated_at - created_at, cap 30min)
        rt_points = reading_time_points(instance.created_at, instance.updated_at)
        if rt_points > 0:
            rt_event_exists = ScoreEvent.objects.filter(
                user_id=user_id,
                season=season,
                kind=ScoreEvent.KIND_READING_TIME,
                ref_id__in=sibling_chapter_ids,
            ).exists()
            if not rt_event_exists:
                ScoreEvent.objects.create(
                    user_id=user_id,
                    season=season,
                    kind=ScoreEvent.KIND_READING_TIME,
                    ref_id=chapter_id,
                    points=rt_points,
                )
                delta += rt_points

        # 3) Bônus por obra completa — dedup at Work level (qualquer
        # variante do mesmo Work conta como mesma obra). So checa se o
        # chapter event foi novo (evita N queries em saves duplicados).
        if not chapter_event_exists:
            work_event_exists = ScoreEvent.objects.filter(
                user_id=user_id,
                season=season,
                kind=ScoreEvent.KIND_WORK_COMPLETE,
                ref_id__in=all_work_manga_ids,
            ).exists()
            if not work_event_exists:
                total = Chapter.objects.filter(manga_id__in=all_work_manga_ids).values(
                    "number"
                ).distinct().count()
                completed_numbers = (
                    ReadingProgress.objects.filter(
                        user_id=user_id,
                        chapter__manga_id__in=all_work_manga_ids,
                        completed=True,
                    )
                    .values("chapter__number")
                    .distinct()
                    .count()
                )
                if total > 0 and completed_numbers >= total:
                    bonus = total * POINTS_WORK_BONUS_PER_CHAPTER
                    ScoreEvent.objects.create(
                        user_id=user_id,
                        season=season,
                        kind=ScoreEvent.KIND_WORK_COMPLETE,
                        ref_id=manga_id,
                        points=bonus,
                    )
                    delta += bonus

        if delta:
            UserSeasonStats.objects.filter(pk=stats.pk).update(
                score=F("score") + delta
            )
            # ----------------------------------------------------------
            # Promocao de tier: detecta cruzamento de threshold e dispara
            # push notification + atualiza peak_rank_tier.
            # ----------------------------------------------------------
            new_score = stats.score + delta
            new_tier = rank_for_score(new_score).tier
            if new_tier > stats.peak_rank_tier:
                # Persiste o novo peak antes de notificar — se o push
                # falhar, idempotencia ainda evita re-disparo (compara com
                # peak_rank_tier ja atualizado).
                UserSeasonStats.objects.filter(pk=stats.pk).update(
                    peak_rank_tier=new_tier,
                    rank_tier=new_tier,
                )
                # Notificacao fora do bloco transaction.atomic (evita
                # serializar I/O remoto dentro do lock). Captura erros pra
                # nao quebrar o award se push falhar.
                _send_promotion_push.delay_after_commit(
                    user_id=instance.user_id,
                    tier=new_tier,
                )


class _PromotionPushDispatch:
    """Helper pra disparar push ASSIM QUE a transacao commitar.

    Sem isso, send_to_user pode rodar antes do COMMIT do UPDATE de stats
    — outras requests veriam estado inconsistente. ``transaction.on_commit``
    encera o callback no commit final do outer transaction.
    """

    @staticmethod
    def delay_after_commit(*, user_id: int, tier: int):
        from django.contrib.auth import get_user_model
        from django.db import transaction as _txn

        from .push import is_configured, send_to_user
        from .ranking import RANK_BY_TIER

        def _do():
            if not is_configured():
                return
            try:
                user = get_user_model().objects.get(pk=user_id)
            except get_user_model().DoesNotExist:
                return
            rank = RANK_BY_TIER.get(tier)
            if not rank:
                return
            try:
                send_to_user(
                    user,
                    title=f"PROMOCAO // {rank.name.upper()}",
                    body=f"Voce alcancou o tier {rank.name}. Conferir ranking?",
                    url="/leaderboard",
                    tag=f"rank-promo-{rank.tier}",
                )
            except Exception:
                pass  # nao quebra signal por erro de push

        _txn.on_commit(_do)


_send_promotion_push = _PromotionPushDispatch()
