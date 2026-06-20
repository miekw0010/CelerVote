from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0003_vote_voter_group'),
    ]

    operations = [
        # Index on payment_ref speeds up every duplicate-check query
        # (Vote.objects.filter(payment_ref=...)) that now runs inside the
        # select_for_update() locked section of cast_vote(). Without this
        # index, that check does a full table scan on every single vote
        # cast, which gets slower as Vote rows grow into the tens of
        # thousands — and a slow check widens the exact race-condition
        # window the lock is meant to close.
        migrations.AddIndex(
            model_name='vote',
            index=models.Index(fields=['payment_ref'], name='votes_payment_ref_idx'),
        ),
    ]
