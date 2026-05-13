from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Profile, ReadingProgress, ScoreEvent, Season, UserSeasonStats
from .ranking import (
    POINTS_CHAPTER,
    POINTS_WORK_BONUS_PER_CHAPTER,
    reading_time_points,
)


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
    está concluído. Idempotente: ScoreEvent tem constraint única por
    (user, season, kind, ref_id), então saves repetidos não dão pontos
    extras.
    """
    if not instance.completed:
        return

    season = Season.current()
    if season is None:
        # Sem season ativa (instalação nova antes do seed). Silenciosamente
        # não pontua — quando a season for criada, capítulos futuros pontuam.
        return

    user_id = instance.user_id
    chapter_id = instance.chapter_id

    with transaction.atomic():
        stats, _ = UserSeasonStats.objects.select_for_update().get_or_create(
            user_id=user_id, season=season
        )

        # 1) Pontos por capítulo lido
        _, chapter_created = ScoreEvent.objects.get_or_create(
            user_id=user_id,
            season=season,
            kind=ScoreEvent.KIND_CHAPTER,
            ref_id=chapter_id,
            defaults={"points": POINTS_CHAPTER},
        )
        delta = POINTS_CHAPTER if chapter_created else 0

        # 2) Pontos por tempo de leitura (delta updated_at - created_at, cap 30min)
        rt_points = reading_time_points(instance.created_at, instance.updated_at)
        if rt_points > 0:
            _, rt_created = ScoreEvent.objects.get_or_create(
                user_id=user_id,
                season=season,
                kind=ScoreEvent.KIND_READING_TIME,
                ref_id=chapter_id,
                defaults={"points": rt_points},
            )
            if rt_created:
                delta += rt_points

        # 3) Bônus por obra completa — só checa se o evento de capítulo foi
        # novo (evita N queries de count em saves duplicados).
        if chapter_created:
            from employees.models import Chapter, Manga

            manga_id = (
                Chapter.objects.filter(id=chapter_id)
                .values_list("manga_id", flat=True)
                .first()
            )
            if manga_id:
                total = Chapter.objects.filter(manga_id=manga_id).count()
                completed_by_user = ReadingProgress.objects.filter(
                    user_id=user_id, chapter__manga_id=manga_id, completed=True
                ).count()
                if total > 0 and completed_by_user >= total:
                    bonus = total * POINTS_WORK_BONUS_PER_CHAPTER
                    _, work_created = ScoreEvent.objects.get_or_create(
                        user_id=user_id,
                        season=season,
                        kind=ScoreEvent.KIND_WORK_COMPLETE,
                        ref_id=manga_id,
                        defaults={"points": bonus},
                    )
                    if work_created:
                        delta += bonus

        if delta:
            UserSeasonStats.objects.filter(pk=stats.pk).update(
                score=F("score") + delta
            )
