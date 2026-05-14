"""Adiciona Profile.show_preferred_language_only — flag de filtro de
catalogo por idioma preferido do user."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_readinglist_collaborators"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="show_preferred_language_only",
            field=models.BooleanField(default=False),
        ),
    ]
