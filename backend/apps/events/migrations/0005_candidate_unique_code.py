from django.db import migrations, models
import random
import string


def generate_code():
    chars = (string.ascii_uppercase + string.digits).translate(str.maketrans('', '', '01OILZ'))
    return ''.join(random.choices(chars, k=6))


def assign_codes(apps, schema_editor):
    Candidate = apps.get_model('events', 'Candidate')
    used = set()
    for candidate in Candidate.objects.all():
        if not candidate.code:
            code = generate_code()
            attempts = 0
            while code in used or Candidate.objects.filter(code=code).exists():
                code = generate_code()
                attempts += 1
                if attempts > 100:
                    raise ValueError('Could not generate unique code')
            candidate.code = code
            used.add(code)
            candidate.save(update_fields=['code'])


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0004_voterroll_voter_id_index'),
    ]

    operations = [
        # Skip adding the column - it already exists
        # Just make sure it has the unique constraint
        migrations.AlterField(
            model_name='candidate',
            name='code',
            field=models.CharField(
                max_length=6, unique=True, db_index=True,
                help_text='Auto-generated 6-char unique vote code e.g. AB3X9K'
            ),
        ),
    ]
