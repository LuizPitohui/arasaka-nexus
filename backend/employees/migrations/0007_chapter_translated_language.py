from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0006_manga_content_rating"),
    ]

    operations = [
        migrations.AddField(
            model_name="chapter",
            name="translated_language",
            field=models.CharField(blank=True, db_index=True, default="", max_length=10),
        ),
    ]
