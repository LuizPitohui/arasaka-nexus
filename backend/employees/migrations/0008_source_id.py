from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0007_chapter_translated_language"),
    ]

    operations = [
        migrations.AddField(
            model_name="manga",
            name="source_id",
            field=models.CharField(db_index=True, default="mangadex", max_length=20),
        ),
        migrations.AddField(
            model_name="chapter",
            name="source_id",
            field=models.CharField(db_index=True, default="mangadex", max_length=20),
        ),
    ]
