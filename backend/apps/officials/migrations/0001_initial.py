from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('events', '0004_voterroll_voter_id_index'),
        ('tickets', '0002_alter_ticket_buyer'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Official',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('phone', models.CharField(max_length=30, unique=True)),
                ('event_kind', models.CharField(choices=[('election', 'Election / Voting Event'), ('ticketing', 'Ticketing Event')], max_length=20)),
                ('revenue_percentage', models.DecimalField(decimal_places=2, default=0, help_text='Percentage of total event revenue this official earns.', max_digits=5)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='official_profiles', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='officials', to='events.event')),
                ('ticket_event', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='officials', to='tickets.ticketevent')),
            ],
            options={
                'db_table': 'officials',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='official',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(event__isnull=False, ticket_event__isnull=True) |
                    models.Q(event__isnull=True, ticket_event__isnull=False)
                ),
                name='official_must_have_exactly_one_event',
            ),
        ),
        migrations.CreateModel(
            name='WithdrawalRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('note', models.TextField(blank=True, help_text='Optional note from the official.')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('declined', 'Declined')], default='pending', max_length=20)),
                ('admin_note', models.TextField(blank=True, help_text='Admin response note.')),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('official', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='withdrawal_requests', to='officials.official')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_withdrawals', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'withdrawal_requests',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='OfficialOTP',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('phone', models.CharField(max_length=30)),
                ('code', models.CharField(max_length=6)),
                ('is_used', models.BooleanField(default=False)),
                ('attempts', models.IntegerField(default=0)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'official_otps',
                'ordering': ['-created_at'],
            },
        ),
    ]
