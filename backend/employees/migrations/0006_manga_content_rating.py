from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0005_manga_cover_path"),
    ]

    operations = [
        migrations.AddField(
            model_name="manga",
            name="content_rating",
            field=models.CharField(
                choices=[
                    ("safe", "Safe"),
                    ("suggestive", "Suggestive"),
                    ("erotica", "Erotica"),
                    ("pornographic", "Pornographic"),
                ],
                db_index=True,
                default="safe",
                max_length=20,
            ),
        ),
    ]
