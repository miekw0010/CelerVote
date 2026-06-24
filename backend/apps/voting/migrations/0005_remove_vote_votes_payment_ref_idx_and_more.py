from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0004_payment_ref_index'),
    ]

    operations = [
        # This mirrors what was actually applied directly on Railway's database
        # (the migration file itself was never committed to git, which broke
        # the migration graph on later deploys). Recreating it here exactly
        # as it ran keeps Django's migration history consistent with the
        # real state of the database.
        migrations.RemoveIndex(
            model_name='vote',
            name='votes_payment_ref_idx',
        ),
        migrations.AlterField(
            model_name='fraudflag',
            name='fraud_type',
            field=models.CharField(
                choices=[
                    ('duplicate_ip', 'Duplicate IP'),
                    ('duplicate_device', 'Duplicate Device'),
                    ('rapid_voting', 'Rapid Voting'),
                    ('payment_anomaly', 'Payment Anomaly'),
                    ('geo_anomaly', 'Geographic Anomaly'),
                    ('vote_spike', 'Vote Spike Detected'),
                    ('manual', 'Manually Flagged'),
                ],
                max_length=30,
            ),
        ),
    ]
