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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile<{self.user.username}>"


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
