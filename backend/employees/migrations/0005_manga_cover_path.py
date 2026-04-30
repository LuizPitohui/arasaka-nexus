from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0004_chapter_mangadex_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="manga",
            name="cover_path",
            field=models.CharField(blank=True, max_length=300, null=True),
        ),
    ]
