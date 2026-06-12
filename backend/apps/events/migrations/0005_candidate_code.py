import random
import string
from django.db import migrations, models


def gen_code(used):
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('0','').replace('O','').replace('1','').replace('I','').replace('L','')
    for _ in range(50):
        code = ''.join(random.choices(chars, k=6))
        if code not in used:
            used.add(code)
            return code
    return ''.join(random.choices(string.digits, k=6))


def assign_codes(apps, schema_editor):
    Candidate = apps.get_model('events', 'Candidate')
    used = set()
    for c in Candidate.objects.all():
        c.code = gen_code(used)
        c.save(update_fields=['code'])


class Migration(migrations.Migration):
    dependencies = [('events', '0004_voterroll_voter_id_index')]
    operations = [
        migrations.AddField(
            model_name='candidate',
            name='code',
            field=models.CharField(
                max_length=6, blank=True, unique=False,
                help_text='6-character unique vote code e.g. AB3X9K'
            ),
        ),
        migrations.RunPython(assign_codes, migrations.RunPython.noop),
    ]
