from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0002_event_hide_vote_counts_event_results_published'),
    ]

    operations = [
        # ── Event new fields ───────────────────────────────────────────
        migrations.AddField(
            model_name='event',
            name='voting_mode',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('open',         'Open — anyone can vote'),
                    ('organizational','Organizational — voting code required'),
                ],
                default='open',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='show_group_results',
            field=models.BooleanField(default=False),
        ),

        # ── VoterGroup ─────────────────────────────────────────────────
        migrations.CreateModel(
            name='VoterGroup',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ('event',      models.ForeignKey('events.Event', on_delete=models.CASCADE, related_name='voter_groups')),
                ('name',       models.CharField(max_length=200)),
                ('description',models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'voter_groups',
                'unique_together': {('event', 'name')},
                'ordering': ['name'],
            },
        ),

        # ── VoterRoll ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='VoterRoll',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ('event',        models.ForeignKey('events.Event', on_delete=models.CASCADE, related_name='voter_roll')),
                ('group',        models.ForeignKey('events.VoterGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='voters')),
                ('voter_id',     models.CharField(max_length=100)),
                ('name',         models.CharField(max_length=200, blank=True)),
                ('phone',        models.CharField(max_length=30, blank=True)),
                ('email',        models.EmailField(blank=True)),
                ('voting_code',  models.CharField(max_length=10, unique=True)),
                ('status',       models.CharField(max_length=10, choices=[('unused','Unused'),('used','Used')], default='unused')),
                ('sms_sent',     models.BooleanField(default=False)),
                ('used_at',      models.DateTimeField(null=True, blank=True)),
                ('created_at',   models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'voter_roll',
                'unique_together': {('event', 'voter_id')},
                'ordering': ['voter_id'],
            },
        ),

        # ── Category new fields ────────────────────────────────────────
        migrations.AddField(
            model_name='category',
            name='is_global',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='category',
            name='groups',
            field=models.ManyToManyField('events.VoterGroup', blank=True, related_name='categories'),
        ),
    ]
