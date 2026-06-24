import uuid
from django.db import models
from django.conf import settings


class VoteSession(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event        = models.ForeignKey('events.Event', on_delete=models.CASCADE, related_name='vote_sessions')
    voter        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='vote_sessions'
    )
    voter_email  = models.EmailField(null=True, blank=True)
    voter_phone  = models.CharField(max_length=20, null=True, blank=True)
    voter_name   = models.CharField(max_length=150, null=True, blank=True)
    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    user_agent   = models.TextField(blank=True)
    device_fingerprint = models.CharField(max_length=200, blank=True)
    votes_cast   = models.IntegerField(default=0)
    total_paid   = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_flagged   = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vote_sessions'
        indexes  = [
            models.Index(fields=['event', 'voter']),
            models.Index(fields=['voter_email']),
            models.Index(fields=['ip_address']),
        ]

    def __str__(self):
        return f'Session: {self.voter_email or self.voter_phone} on {self.event.title}'


class Vote(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session        = models.ForeignKey(VoteSession, on_delete=models.CASCADE, related_name='votes')
    event          = models.ForeignKey('events.Event', on_delete=models.CASCADE, related_name='votes')
    category       = models.ForeignKey('events.Category', on_delete=models.CASCADE, related_name='votes')
    candidate      = models.ForeignKey(
        'events.Candidate', on_delete=models.CASCADE, related_name='votes',
        null=True, blank=True
    )
    rank           = models.IntegerField(null=True, blank=True)
    voter_group    = models.ForeignKey(
        'events.VoterGroup', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='votes'
    )
    encrypted_data = models.TextField()
    payment_ref    = models.CharField(max_length=100, blank=True)
    is_paid        = models.BooleanField(default=False)
    ip_address     = models.GenericIPAddressField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'votes'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['event', 'category']),
            models.Index(fields=['candidate']),
            models.Index(fields=['session']),
        ]

    def __str__(self):
        return f'Vote {self.id} on {self.event.title}'


class FraudFlag(models.Model):
    class FraudType(models.TextChoices):
        DUPLICATE_IP     = 'duplicate_ip',     'Duplicate IP'
        DUPLICATE_DEVICE = 'duplicate_device', 'Duplicate Device'
        RAPID_VOTING     = 'rapid_voting',     'Rapid Voting'
        PAYMENT_ANOMALY  = 'payment_anomaly',  'Payment Anomaly'
        GEO_ANOMALY      = 'geo_anomaly',      'Geographic Anomaly'
        VOTE_SPIKE       = 'vote_spike',       'Vote Spike Detected'
        MANUAL           = 'manual',           'Manually Flagged'

    class Resolution(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CLEARED = 'cleared', 'Cleared'
        BLOCKED = 'blocked', 'Blocked'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event       = models.ForeignKey('events.Event', on_delete=models.CASCADE, related_name='fraud_flags')
    session     = models.ForeignKey(VoteSession, on_delete=models.CASCADE, related_name='fraud_flags', null=True)
    fraud_type  = models.CharField(max_length=30, choices=FraudType.choices)
    description = models.TextField()
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    resolution  = models.CharField(max_length=20, choices=Resolution.choices, default=Resolution.PENDING)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fraud_flags'
        ordering = ['-created_at']

    def __str__(self):
        return f'FraudFlag: {self.fraud_type} on {self.event.title}'

class AdminAuditLog(models.Model):
    class Action(models.TextChoices):
        VOTE_RESET       = 'vote_reset',       'Vote Reset'
        MANUAL_RECOVERY  = 'manual_recovery',  'Manual Vote Recovery'
        FRAUD_RESOLVED   = 'fraud_resolved',   'Fraud Flag Resolved'
        STATUS_CHANGED   = 'status_changed',   'Event Status Changed'
        RESULTS_PUBLISHED= 'results_published','Results Published'
        SESSION_SUSPENDED= 'session_suspended','Session Suspended'
        CANDIDATE_ADDED  = 'candidate_added',  'Candidate Added'
        CANDIDATE_REMOVED= 'candidate_removed','Candidate Removed'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admin       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='audit_logs'
    )
    event       = models.ForeignKey(
        'events.Event', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='audit_logs'
    )
    action      = models.CharField(max_length=30, choices=Action.choices)
    description = models.TextField()
    metadata    = models.JSONField(default=dict, blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'admin_audit_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.admin} — {self.action} at {self.created_at}'


class VoterGeoLog(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session     = models.ForeignKey(VoteSession, on_delete=models.CASCADE, related_name='geo_logs')
    ip_address  = models.GenericIPAddressField()
    country     = models.CharField(max_length=100, blank=True)
    country_code= models.CharField(max_length=5, blank=True)
    city        = models.CharField(max_length=100, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'voter_geo_logs'
        ordering = ['-created_at']

# Note: fraud types now live exclusively on FraudFlag.FraudType (above).
# A duplicate standalone FraudType class used to exist here and caused a
# production bug — services.py referenced FraudFlag.FraudType.VOTE_SPIKE,
# which didn't exist on the nested class (only on this now-removed
# duplicate), silently crashing every USSD paid vote cast with:
#   AttributeError: type object 'FraudType' has no attribute 'VOTE_SPIKE'
