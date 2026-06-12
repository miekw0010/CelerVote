from django.db import migrations, models
import random
import string

def generate_code():
    chars = (string.ascii_uppercase + string.digits).translate(str.maketrans('', '', '01OILZ'))
    return ''.join(random.choices(chars, k=6))

def assign_codes(apps, schema_editor):
    Candidate = apps.get_model('events', 'Candidate')
    # Only assign codes to candidates that don't have one
    candidates_without_code = Candidate.objects.filter(code__isnull=True)
    
    if candidates_without_code.exists():
        used_codes = set(Candidate.objects.filter(code__isnull=False).values_list('code', flat=True))
        
        for candidate in candidates_without_code:
            code = generate_code()
            attempts = 0
            while code in used_codes or Candidate.objects.filter(code=code).exists():
                code = generate_code()
                attempts += 1
                if attempts > 100:
                    raise ValueError(f'Could not generate unique code for candidate {candidate.id}')
            candidate.code = code
            used_codes.add(code)
            candidate.save(update_fields=['code'])

class Migration(migrations.Migration):

    dependencies = [
        ('events', '0004_voterroll_voter_id_index'),
    ]

    operations = [
        # Step 1: Add the field as nullable first
        migrations.AddField(
            model_name='candidate',
            name='code',
            field=models.CharField(
                max_length=6, null=True, blank=True,
                help_text='Auto-generated 6-char unique vote code e.g. AB3X9K'
            ),
        ),
        # Step 2: Populate the codes
        migrations.RunPython(assign_codes, migrations.RunPython.noop),
        # Step 3: Add the unique constraint and make it non-nullable
        migrations.AlterField(
            model_name='candidate',
            name='code',
            field=models.CharField(
                max_length=6, unique=True, db_index=True,
                help_text='Auto-generated 6-char unique vote code e.g. AB3X9K'
            ),
        ),
    ]