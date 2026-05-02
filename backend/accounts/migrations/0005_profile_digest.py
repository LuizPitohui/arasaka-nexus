from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_favorite_notify_on_new_chapter"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="digest_mode",
            field=models.CharField(
                choices=[("immediate", "Imediata"), ("daily", "Resumo diário")],
                default="immediate",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="digest_hour",
            field=models.PositiveSmallIntegerField(default=20),
        ),
        migrations.AddField(
            model_name="profile",
            name="last_digest_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
