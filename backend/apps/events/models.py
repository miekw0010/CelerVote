import uuid
import random
import string
from django.db import models
from django.utils import timezone
from django.conf import settings
from cloudinary_storage.storage import MediaCloudinaryStorage


def generate_voting_code():
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('0','').replace('O','').replace('1','').replace('I','').replace('L','')
    return ''.join(random.choices(chars, k=6))


class Event(models.Model):
    class Status(models.TextChoices):
        DRAFT     = 'draft',     'Draft'
        SCHEDULED = 'scheduled', 'Scheduled'
        ACTIVE    = 'active',    'Active'
        PAUSED    = 'paused',    'Paused'
        ENDED     = 'ended',     'Ended'
        ARCHIVED  = 'archived',  'Archived'

    class VotingType(models.TextChoices):
        SINGLE_CHOICE   = 'single_choice',   'Single Choice'
        MULTIPLE_CHOICE = 'multiple_choice', 'Multiple Choice'
        RANKED_CHOICE   = 'ranked_choice',   'Ranked Choice'
        YES_NO          = 'yes_no',          'Yes / No'
        POLL            = 'poll',            'Poll / Survey'

    class EventType(models.TextChoices):
        ELECTION  = 'election',        'Election'
        ORG       = 'organizational',  'Organizational Election'
        CONTEST   = 'contest',         'Talent / Awards Contest'
        SURVEY    = 'survey',          'Survey'
        LIVE_SHOW = 'live_show',       'Live Show / Awards'

    class VotingMode(models.TextChoices):
        OPEN           = 'open',           'Open — anyone can vote'
        ORGANIZATIONAL = 'organizational', 'Organizational — voting code required'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug        = models.SlugField(unique=True, max_length=100)
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    event_type  = models.CharField(max_length=20, choices=EventType.choices, default=EventType.ELECTION)
    voting_type = models.CharField(max_length=20, choices=VotingType.choices, default=VotingType.SINGLE_CHOICE)
    voting_mode = models.CharField(max_length=20, choices=VotingMode.choices, default=VotingMode.OPEN)
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    organizer   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='organized_events')
    allow_multiple_votes = models.BooleanField(default=False)
    max_votes_per_user   = models.IntegerField(default=1)
    max_choices_per_vote = models.IntegerField(default=1)
    require_auth         = models.BooleanField(default=True)
    start_time  = models.DateTimeField(null=True, blank=True)
    end_time    = models.DateTimeField(null=True, blank=True)
    banner_image = models.ImageField(upload_to='event_banners/', null=True, blank=True, storage=MediaCloudinaryStorage())
    thumbnail    = models.ImageField(upload_to='event_thumbs/', null=True, blank=True, storage=MediaCloudinaryStorage())
    theme_color  = models.CharField(max_length=20, default='#6366f1')
    theme_config = models.JSONField(default=dict, blank=True)
    is_paid         = models.BooleanField(default=False)
    price_per_vote  = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    currency        = models.CharField(max_length=5, default='GHS')
    show_live_results  = models.BooleanField(default=True)
    results_visible    = models.BooleanField(default=False)
    results_published  = models.BooleanField(default=False)
    hide_vote_counts   = models.BooleanField(default=False)
    show_group_results = models.BooleanField(default=False)
    languages   = models.JSONField(default=list)
    total_votes = models.IntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'events'
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def is_open(self):
        now = timezone.now()
        if self.status != self.Status.ACTIVE:
            return False
        if self.start_time and now < self.start_time:
            return False
        if self.end_time and now > self.end_time:
            return False
        return True

    @property
    def is_organizational(self):
        return self.voting_mode == self.VotingMode.ORGANIZATIONAL


class VoterGroup(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event       = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='voter_groups')
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'voter_groups'
        unique_together = [('event', 'name')]
        ordering = ['name']

    def __str__(self):
        return f'{self.event.title} → {self.name}'


class VoterRoll(models.Model):
    class Status(models.TextChoices):
        UNUSED = 'unused', 'Unused'
        USED   = 'used',   'Used'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event       = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='voter_roll')
    group       = models.ForeignKey(VoterGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='voters')
    voter_id    = models.CharField(max_length=100, db_index=True)
    name        = models.CharField(max_length=200, blank=True)
    phone       = models.CharField(max_length=30, blank=True)
    email       = models.EmailField(blank=True)
    voting_code = models.CharField(max_length=10, unique=True)
    status      = models.CharField(max_length=10, choices=Status.choices, default=Status.UNUSED)
    sms_sent    = models.BooleanField(default=False)
    used_at     = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'voter_roll'
        unique_together = [('event', 'voter_id')]
        ordering = ['voter_id']

    def __str__(self):
        return f'{self.voter_id} ({self.voting_code}) — {self.event.title}'

    def save(self, *args, **kwargs):
        if not self.voting_code:
            self.voting_code = self._unique_code()
        super().save(*args, **kwargs)

    @staticmethod
    def _unique_code():
        for _ in range(20):
            code = generate_voting_code()
            if not VoterRoll.objects.filter(voting_code=code).exists():
                return code
        raise ValueError('Could not generate unique voting code.')


class Category(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event       = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='categories')
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order       = models.IntegerField(default=0)
    voting_type = models.CharField(max_length=20, choices=Event.VotingType.choices, null=True, blank=True)
    is_active   = models.BooleanField(default=True)
    is_global   = models.BooleanField(default=True)
    groups      = models.ManyToManyField(VoterGroup, blank=True, related_name='categories')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'categories'
        ordering = ['order', 'name']

    def __str__(self):
        return f'{self.event.title} → {self.name}'

    def is_visible_to_voter(self, voter_roll_entry):
        if self.is_global:
            return True
        if voter_roll_entry is None or voter_roll_entry.group is None:
            return False
        return self.groups.filter(id=voter_roll_entry.group_id).exists()


class Candidate(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category    = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='candidates')
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    photo       = models.ImageField(upload_to='candidates/', null=True, blank=True, storage=MediaCloudinaryStorage())
    video_url   = models.URLField(blank=True)
    order       = models.IntegerField(default=0)
    is_active   = models.BooleanField(default=True)
    code        = models.CharField(max_length=10, blank=True,
                                   help_text='Auto-generated short code e.g. AB01')
    vote_count  = models.IntegerField(default=0)
    vote_percentage = models.FloatField(default=0.0)
    extra_info  = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'candidates'
        ordering = ['order', 'name']

    def __str__(self):
        return f'{self.name} ({self.category.name})'

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self._generate_code()
        super().save(*args, **kwargs)

    def _generate_code(self):
        import string
        import random
        prefix = ''.join(c for c in self.category.name.upper() if c.isalpha())[:2] or 'CD'
        for _ in range(30):
            suffix = ''.join(random.choices(string.digits, k=2))
            code = f"{prefix}{suffix}"
            if not Candidate.objects.filter(
                category=self.category, code=code
            ).exists():
                return code
        return f"CD{random.randint(10,99)}"
