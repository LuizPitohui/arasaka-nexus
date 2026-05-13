"""Sistema de rank competitivo: Season, ScoreEvent, UserSeasonStats.

Adiciona também ``created_at`` em ReadingProgress (auto_now_add). Rows
existentes ganham ``now()`` no momento da migração — perda aceitável,
pontos de tempo de leitura só passam a contar pra leituras novas.

Data migration no final cria a Season inaugural cobrindo o trimestre atual.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def _seed_initial_season(apps, schema_editor):
    Season = apps.get_model("accounts", "Season")
    if Season.objects.exists():
        return
    from datetime import timedelta

    from django.utils import timezone

    now = timezone.now()
    quarter = ((now.month - 1) // 3) + 1
    slug = f"season-{now.year}-q{quarter}"
    Season.objects.create(
        slug=slug,
        name=f"Season {now.year} Q{quarter}",
        starts_at=now,
        ends_at=now + timedelta(days=90),
        is_active=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_pushsub_click_count"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="readingprogress",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.CreateModel(
            name="Season",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=80)),
                ("slug", models.SlugField(unique=True)),
                ("starts_at", models.DateTimeField()),
                ("ends_at", models.DateTimeField()),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-starts_at"]},
        ),
        migrations.CreateModel(
            name="ScoreEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("chapter", "Capítulo lido"),
                            ("work_complete", "Obra completa"),
                            ("reading_time", "Tempo de leitura"),
                        ],
                        max_length=20,
                    ),
                ),
                ("ref_id", models.PositiveIntegerField()),
                ("points", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "season",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="score_events",
                        to="accounts.season",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="score_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="scoreevent",
            constraint=models.UniqueConstraint(
                fields=("user", "season", "kind", "ref_id"),
                name="unique_score_event_per_ref",
            ),
        ),
        migrations.AddIndex(
            model_name="scoreevent",
            index=models.Index(fields=["season", "user"], name="accounts_sc_season__b1bc60_idx"),
        ),
        migrations.CreateModel(
            name="UserSeasonStats",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("score", models.PositiveIntegerField(default=0)),
                ("position", models.PositiveIntegerField(blank=True, null=True)),
                ("rank_tier", models.PositiveSmallIntegerField(default=0)),
                ("peak_rank_tier", models.PositiveSmallIntegerField(default=0)),
                ("computed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "season",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_stats",
                        to="accounts.season",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="season_stats",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-score"]},
        ),
        migrations.AddConstraint(
            model_name="userseasonstats",
            constraint=models.UniqueConstraint(
                fields=("user", "season"), name="unique_user_per_season_stats"
            ),
        ),
        migrations.AddIndex(
            model_name="userseasonstats",
            index=models.Index(fields=["season", "-score"], name="accounts_us_season__s1a2b3_idx"),
        ),
        migrations.AddIndex(
            model_name="userseasonstats",
            index=models.Index(fields=["season", "position"], name="accounts_us_season__p9z8y7_idx"),
        ),
        migrations.RunPython(_seed_initial_season, reverse_code=migrations.RunPython.noop),
    ]
