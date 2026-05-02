from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_pushsubscription"),
    ]

    operations = [
        migrations.AddField(
            model_name="favorite",
            name="notify_on_new_chapter",
            field=models.BooleanField(default=True),
        ),
    ]
