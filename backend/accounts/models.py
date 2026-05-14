from django.conf import settings
from django.db import models


READER_MODE_CHOICES = [
    ("vertical", "Vertical contínuo"),
    ("paged", "Paginado"),
    ("webtoon", "Webtoon"),
    ("double", "Página dupla"),
]


DIGEST_MODE_CHOICES = [
    ("immediate", "Imediata"),
    ("daily", "Resumo diário"),
]


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    bio = models.TextField(blank=True, default="")
    preferred_language = models.CharField(max_length=10, default="pt-br")
    reader_mode = models.CharField(
        max_length=20,
        choices=READER_MODE_CHOICES,
        default="vertical",
    )
    # Birthdate is set ONCE (during register or first profile fill for legacy
    # accounts). After ``birthdate_set_at`` is filled, the API rejects further
    # updates and the user must contact an admin to amend (audit trail).
    birthdate = models.DateField(null=True, blank=True)
    birthdate_set_at = models.DateTimeField(null=True, blank=True)
    # Whether this user has unlocked adult content. Defaults to False even when
    # birthdate >= 18 — user must explicitly opt-in via UI.
    show_adult = models.BooleanField(default=False)

    # Push delivery mode:
    #   immediate (default): cada capitulo gera 1 push assim que entra
    #   daily: nada de push em tempo real; 1 push por dia agrupando todos
    #   os capitulos que chegaram nas ultimas 24h, no horario digest_hour
    #   (em hora local TIME_ZONE).
    digest_mode = models.CharField(
        max_length=10,
        choices=DIGEST_MODE_CHOICES,
        default="immediate",
    )
    # Hora local (0-23) em que o digest sai. So usado quando digest_mode='daily'.
    digest_hour = models.PositiveSmallIntegerField(default=20)
    # Marca o ultimo digest entregue, pra task evitar contar capitulos
    # duplicados se rodar 2x na mesma hora ou se user mudar fuso.
    last_digest_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile<{self.user.username}>"

    @property
    def age(self) -> int | None:
        if not self.birthdate:
            return None
        from datetime import date

        today = date.today()
        return today.year - self.birthdate.year - (
            (today.month, today.day) < (self.birthdate.month, self.birthdate.day)
        )

    @property
    def is_adult(self) -> bool:
        a = self.age
        return a is not None and a >= 18


class Favorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    manga = models.ForeignKey(
        "employees.Manga",
        on_delete=models.CASCADE,
        related_name="favorited_by",
    )
    # Default True: favoritar e implicit opt-in de notificacao. User pode
    # silenciar mangas barulhentos (webtoons que postam diariamente) sem
    # precisar desfavoritar.
    notify_on_new_chapter = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "manga"], name="unique_user_manga_favorite"),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} ♥ {self.manga.title}"


class ReadingList(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reading_lists",
        help_text="Owner — quem criou. Tem permissao total (metadata, delete, gestao de membros).",
    )
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    mangas = models.ManyToManyField(
        "employees.Manga",
        through="ReadingListItem",
        related_name="in_reading_lists",
        blank=True,
    )
    # Colaboradores podem adicionar/remover itens (mesmo poder do owner
    # exceto sobre metadata + gestao de pessoas + delete da lista).
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="collab_lists",
        blank=True,
        help_text="Adicionados pelo owner via invite. Podem adicionar/remover obras.",
    )

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.user.username})"


class ReadingListItem(models.Model):
    reading_list = models.ForeignKey(
        ReadingList, on_delete=models.CASCADE, related_name="items"
    )
    manga = models.ForeignKey("employees.Manga", on_delete=models.CASCADE)
    position = models.PositiveIntegerField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["reading_list", "manga"], name="unique_list_manga"
            ),
        ]
        ordering = ["position", "added_at"]


class PushSubscription(models.Model):
    """Web Push subscription por dispositivo.

    Cada navegador/dispositivo do usuario gera um endpoint unico (Mozilla,
    FCM, WNS, etc). Guardamos os 3 campos exigidos pelo Web Push protocol
    (endpoint + duas chaves do payload encryption) e usamos pra disparar
    notificacoes via pywebpush.

    Endpoints podem expirar (FCM gira tokens) — quando uma push falha com
    410 Gone / 404, o sender chama .delete() pra nao tentar de novo.

    `tag` opcional permite agrupar/substituir notificacoes do mesmo tipo
    (ex: 5 capitulos novos do mesmo manga viram 1 so).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=128)
    auth = models.CharField(max_length=64)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    # Contadores agregados pra dashboard /mikoshi/admin. Atualizados via F()
    # no send_to_subscription — sem race se 2 workers entregarem em paralelo.
    delivery_count = models.PositiveIntegerField(default=0)
    failure_count = models.PositiveIntegerField(default=0)
    last_delivery_at = models.DateTimeField(null=True, blank=True)
    # Engagement signal: SW notificationclick POSTa em /api/push/clicked/
    # com o endpoint, e a gente bumpa aqui. click_rate = click/delivery.
    click_count = models.PositiveIntegerField(default=0)
    last_click_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_seen_at"]
        indexes = [models.Index(fields=["user", "-last_seen_at"])]

    def __str__(self):
        return f"PushSub<{self.user.username}@{self.endpoint[:40]}…>"


class ReadingProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reading_progress",
    )
    chapter = models.ForeignKey(
        "employees.Chapter",
        on_delete=models.CASCADE,
        related_name="reading_progress_entries",
    )
    page_number = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    # created_at marca a primeira interação com o capítulo (auto_now_add).
    # Usado pelo sistema de rank pra estimar tempo de leitura (delta até
    # updated_at, capado a 30min). Nullable só por compat com rows legadas
    # (anteriores à migração 0008) — novas linhas sempre têm valor.
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "chapter"], name="unique_user_chapter_progress"
            ),
        ]
        ordering = ["-updated_at"]


# ---------------------------------------------------------------------------
# Ranking competitivo (ver accounts/ranking.py pra constantes)
# ---------------------------------------------------------------------------
class Season(models.Model):
    """Janela de competição de 3 meses. Reset zera score, peak rank é
    snapshot histórico no UserSeasonStats.
    """

    name = models.CharField(max_length=80)
    slug = models.SlugField(unique=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    # Só uma season ativa por vez. Quando ends_at < now, a task close_season
    # vira essa em False e cria a próxima.
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-starts_at"]

    def __str__(self):
        return self.name

    @classmethod
    def current(cls):
        """Retorna a season ativa (ou None se nenhuma). Cacheado por request
        via lazy lookup — chamadores que disparam muitas vezes devem cachear
        externamente.
        """
        return cls.objects.filter(is_active=True).order_by("-starts_at").first()


class ScoreEvent(models.Model):
    """Registro imutável de cada concessão de pontos.

    Source-of-truth pra auditoria e recomputação. Constraint única por
    (user, season, kind, ref) garante idempotência — se o signal disparar
    2x pro mesmo capítulo, só o primeiro vira pontos.
    """

    KIND_CHAPTER = "chapter"
    KIND_WORK_COMPLETE = "work_complete"
    KIND_READING_TIME = "reading_time"
    KIND_CHOICES = [
        (KIND_CHAPTER, "Capítulo lido"),
        (KIND_WORK_COMPLETE, "Obra completa"),
        (KIND_READING_TIME, "Tempo de leitura"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="score_events",
    )
    season = models.ForeignKey(
        Season,
        on_delete=models.CASCADE,
        related_name="score_events",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    # Referência polimórfica leve: pro KIND_CHAPTER/KIND_READING_TIME guarda
    # chapter_id; pro KIND_WORK_COMPLETE guarda manga_id. Não-FK pra evitar
    # CASCADE drop quando a obra é removida do catálogo (queremos preservar
    # o histórico de pontos do user).
    ref_id = models.PositiveIntegerField()
    points = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "season", "kind", "ref_id"],
                name="unique_score_event_per_ref",
            ),
        ]
        indexes = [models.Index(fields=["season", "user"])]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} +{self.points} ({self.kind})"


class Follow(models.Model):
    """Seguidor → seguido. Direcional (user_a segue user_b ≠ vice-versa).

    Constraint unique pra evitar follow duplicado. Self-follow bloqueado
    via clean() — defensivo, view tambem checa antes.
    """

    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following_set",
        help_text="Quem segue",
    )
    followed = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="followers_set",
        help_text="Quem e seguido",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "followed"], name="unique_follow_pair"
            ),
            # Django 6 renomeou ``check`` -> ``condition`` em CheckConstraint.
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("followed")),
                name="no_self_follow",
            ),
        ]
        indexes = [
            models.Index(fields=["follower", "-created_at"]),
            models.Index(fields=["followed", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.follower.username} → {self.followed.username}"


class UserSeasonStats(models.Model):
    """Snapshot agregado de score+rank por (user, season).

    ``score`` é incrementado atomicamente via F() no signal handler de
    ScoreEvent. ``position`` e ``rank`` são recomputados pela task
    ``recompute_ranks`` (Celery beat diário). ``peak_rank`` nunca regride
    durante a season — guarda o maior tier já alcançado.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="season_stats",
    )
    season = models.ForeignKey(
        Season,
        on_delete=models.CASCADE,
        related_name="user_stats",
    )
    score = models.PositiveIntegerField(default=0)
    # Posição 1-based no leaderboard (1 = topo). Pode ficar NULL antes do
    # primeiro recompute da season.
    position = models.PositiveIntegerField(null=True, blank=True)
    rank_tier = models.PositiveSmallIntegerField(default=0)
    peak_rank_tier = models.PositiveSmallIntegerField(default=0)
    computed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "season"], name="unique_user_per_season_stats"
            ),
        ]
        indexes = [
            models.Index(fields=["season", "-score"]),
            models.Index(fields=["season", "position"]),
        ]
        ordering = ["-score"]

    def __str__(self):
        return f"{self.user.username}@{self.season.slug}: {self.score}pts"
