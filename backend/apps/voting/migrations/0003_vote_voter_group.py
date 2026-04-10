from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0002_votergeolog_adminauditlog'),
        ('events', '0003_organizational_elections'),
    ]

    operations = [
        migrations.AddField(
            model_name='vote',
            name='voter_group',
            field=models.ForeignKey(
                'events.VoterGroup',
                on_delete=models.SET_NULL,
                null=True, blank=True,
                related_name='votes',
            ),
        ),
    ]
