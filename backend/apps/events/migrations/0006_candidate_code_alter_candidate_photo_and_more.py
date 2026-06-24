import cloudinary_storage.storage
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0005_candidate_unique_code"),
    ]

    operations = [
        # The 'code' column already exists in the database (added directly,
        # outside of Django's migration history — see 0005's no-op comment).
        # We use SeparateDatabaseAndState so Django's MODEL STATE picks up
        # the field (fixing "model has changes not reflected in a migration"
        # warnings and letting makemigrations/migrate work correctly going
        # forward), WITHOUT issuing any ALTER TABLE against the real database.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="candidate",
                    name="code",
                    field=models.CharField(
                        blank=True,
                        help_text="Auto-generated 6-char unique vote code e.g. AB3X9K",
                        max_length=6,
                        unique=True,
                    ),
                ),
            ],
            database_operations=[],
        ),
        migrations.AlterField(
            model_name="candidate",
            name="photo",
            field=models.ImageField(
                blank=True,
                null=True,
                storage=cloudinary_storage.storage.MediaCloudinaryStorage(),
                upload_to="candidates/",
            ),
        ),
        migrations.AlterField(
            model_name="event",
            name="banner_image",
            field=models.ImageField(
                blank=True,
                null=True,
                storage=cloudinary_storage.storage.MediaCloudinaryStorage(),
                upload_to="event_banners/",
            ),
        ),
        migrations.AlterField(
            model_name="event",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("election", "Election"),
                    ("organizational", "Organizational Election"),
                    ("contest", "Talent / Awards Contest"),
                    ("survey", "Survey"),
                    ("live_show", "Live Show / Awards"),
                ],
                default="election",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="event",
            name="thumbnail",
            field=models.ImageField(
                blank=True,
                null=True,
                storage=cloudinary_storage.storage.MediaCloudinaryStorage(),
                upload_to="event_thumbs/",
            ),
        ),
        migrations.AlterField(
            model_name="votergroup",
            name="id",
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, primary_key=True, serialize=False
            ),
        ),
        migrations.AlterField(
            model_name="voterroll",
            name="id",
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, primary_key=True, serialize=False
            ),
        ),
    ]
