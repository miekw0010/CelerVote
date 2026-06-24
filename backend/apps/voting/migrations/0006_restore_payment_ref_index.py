from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0005_remove_vote_votes_payment_ref_idx_and_more'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='vote',
            index=models.Index(fields=['payment_ref'], name='votes_payment_ref_idx'),
        ),
    ]
