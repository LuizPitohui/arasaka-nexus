"""Adiciona M2M ReadingList.collaborators pra listas colaborativas."""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_follow"),
    ]

    operations = [
        migrations.AddField(
            model_name="readinglist",
            name="collaborators",
            field=models.ManyToManyField(
                blank=True,
                help_text="Adicionados pelo owner via invite. Podem adicionar/remover obras.",
                related_name="collab_lists",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
