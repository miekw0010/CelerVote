from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0003_organizational_elections'),
    ]

    operations = [
        migrations.AlterField(
            model_name='voterroll',
            name='voter_id',
            field=models.CharField(max_length=100, db_index=True),
        ),
    ]
