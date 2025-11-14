import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="article",
            old_name="body",
            new_name="content",
        ),
        migrations.AddField(
            model_name="article",
            name="slug",
            field=models.SlugField(default=uuid.uuid4, max_length=255, unique=True),
            preserve_default=False,
        ),
    ]
