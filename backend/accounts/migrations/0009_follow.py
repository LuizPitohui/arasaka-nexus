"""Cria tabela Follow pra grafo de seguidores (comunidade)."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_ranking"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Follow",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "follower",
                    models.ForeignKey(
                        help_text="Quem segue",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="following_set",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "followed",
                    models.ForeignKey(
                        help_text="Quem e seguido",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="followers_set",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="follow",
            constraint=models.UniqueConstraint(
                fields=("follower", "followed"), name="unique_follow_pair"
            ),
        ),
        migrations.AddConstraint(
            model_name="follow",
            constraint=models.CheckConstraint(
                condition=~models.Q(follower=models.F("followed")),
                name="no_self_follow",
            ),
        ),
        migrations.AddIndex(
            model_name="follow",
            index=models.Index(
                fields=["follower", "-created_at"],
                name="accounts_fo_followe_a32a17_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="follow",
            index=models.Index(
                fields=["followed", "-created_at"],
                name="accounts_fo_followe_b91d23_idx",
            ),
        ),
    ]
