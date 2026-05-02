from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_pushsub_counters"),
    ]

    operations = [
        migrations.AddField(
            model_name="pushsubscription",
            name="click_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="pushsubscription",
            name="last_click_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
