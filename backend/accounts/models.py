from django.conf import settings
from django.db import models


READER_MODE_CHOICES = [
    ("vertical", "Vertical contínuo"),
    ("paged", "Paginado"),
    ("webtoon", "Webtoon"),
    ("double", "Página dupla"),
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
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "chapter"], name="unique_user_chapter_progress"
            ),
        ]
        ordering = ["-updated_at"]
