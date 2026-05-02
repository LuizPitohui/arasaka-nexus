from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_profile_digest"),
    ]

    operations = [
        migrations.AddField(
            model_name="pushsubscription",
            name="delivery_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="pushsubscription",
            name="failure_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="pushsubscription",
            name="last_delivery_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
