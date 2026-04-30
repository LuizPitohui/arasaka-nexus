import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("employees", "0004_chapter_mangadex_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="Profile",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("avatar", models.ImageField(blank=True, null=True, upload_to="avatars/")),
                ("bio", models.TextField(blank=True, default="")),
                ("preferred_language", models.CharField(default="pt-br", max_length=10)),
                (
                    "reader_mode",
                    models.CharField(
                        choices=[
                            ("vertical", "Vertical contínuo"),
                            ("paged", "Paginado"),
                            ("webtoon", "Webtoon"),
                            ("double", "Página dupla"),
                        ],
                        default="vertical",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ReadingList",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=80)),
                ("description", models.TextField(blank=True, default="")),
                ("is_public", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reading_lists",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="ReadingListItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("position", models.PositiveIntegerField(default=0)),
                ("added_at", models.DateTimeField(auto_now_add=True)),
                (
                    "manga",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="employees.manga",
                    ),
                ),
                (
                    "reading_list",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="accounts.readinglist",
                    ),
                ),
            ],
            options={"ordering": ["position", "added_at"]},
        ),
        migrations.AddField(
            model_name="readinglist",
            name="mangas",
            field=models.ManyToManyField(
                blank=True,
                related_name="in_reading_lists",
                through="accounts.ReadingListItem",
                to="employees.manga",
            ),
        ),
        migrations.CreateModel(
            name="Favorite",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "manga",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favorited_by",
                        to="employees.manga",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favorites",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ReadingProgress",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("page_number", models.PositiveIntegerField(default=0)),
                ("completed", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "chapter",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reading_progress_entries",
                        to="employees.chapter",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reading_progress",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.AddConstraint(
            model_name="favorite",
            constraint=models.UniqueConstraint(
                fields=("user", "manga"), name="unique_user_manga_favorite"
            ),
        ),
        migrations.AddConstraint(
            model_name="readinglistitem",
            constraint=models.UniqueConstraint(
                fields=("reading_list", "manga"), name="unique_list_manga"
            ),
        ),
        migrations.AddConstraint(
            model_name="readingprogress",
            constraint=models.UniqueConstraint(
                fields=("user", "chapter"), name="unique_user_chapter_progress"
            ),
        ),
    ]
