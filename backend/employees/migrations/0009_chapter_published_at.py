from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0008_source_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="chapter",
            name="published_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
