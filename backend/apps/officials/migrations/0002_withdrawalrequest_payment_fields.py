from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('officials', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='withdrawalrequest',
            name='payment_method',
            field=models.CharField(
                blank=True, max_length=30,
                choices=[
                    ('mtn_momo', 'MTN Mobile Money'),
                    ('telecel', 'Telecel Cash'),
                    ('at_money', 'AirtelTigo Money'),
                    ('bank', 'Bank Transfer'),
                    ('other', 'Other'),
                ],
                default=''
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='withdrawalrequest',
            name='payment_account_name',
            field=models.CharField(blank=True, max_length=200, default='', help_text='Account/MoMo name'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='withdrawalrequest',
            name='payment_account_number',
            field=models.CharField(blank=True, max_length=50, default='', help_text='Account/MoMo number'),
            preserve_default=False,
        ),
    ]
