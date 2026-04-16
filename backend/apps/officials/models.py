import uuid
from django.db import models
from django.conf import settings


class Official(models.Model):
    """
    An official is a trusted person assigned to manage a specific event or ticket event.
    They have a restricted dashboard — no event creation/editing.
    Assigned by admin at event creation time or later.
    """
    class EventKind(models.TextChoices):
        ELECTION = 'election', 'Election / Voting Event'
        TICKETING = 'ticketing', 'Ticketing Event'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=200)
    phone       = models.CharField(max_length=30, unique=True)
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='official_profiles'
    )

    # Link to exactly ONE event kind
    event_kind  = models.CharField(max_length=20, choices=EventKind.choices)
    event       = models.ForeignKey(
        'events.Event', on_delete=models.CASCADE,
        null=True, blank=True, related_name='officials'
    )
    ticket_event = models.ForeignKey(
        'tickets.TicketEvent', on_delete=models.CASCADE,
        null=True, blank=True, related_name='officials'
    )

    # Paid election revenue share (percentage 0-100)
    revenue_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Percentage of total event revenue this official earns.'
    )

    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'officials'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(event__isnull=False, ticket_event__isnull=True) |
                    models.Q(event__isnull=True,  ticket_event__isnull=False)
                ),
                name='official_must_have_exactly_one_event'
            )
        ]

    def __str__(self):
        event_name = self.event.title if self.event else (self.ticket_event.title if self.ticket_event else '?')
        return f'{self.name} → {event_name}'

    @property
    def current_balance(self):
        """Revenue share earned minus approved withdrawals."""
        from apps.payments.models import Payment
        total_revenue = 0
        if self.event and self.event.is_paid:
            total_revenue = float(
                Payment.objects.filter(
                    event=self.event, status='success'
                ).aggregate(t=models.Sum('amount'))['t'] or 0
            )
        elif self.ticket_event:
            from apps.tickets.models import Ticket
            total_revenue = float(
                Ticket.objects.filter(
                    tier__event=self.ticket_event, status__in=['paid', 'used']
                ).aggregate(t=models.Sum('total_amount'))['t'] or 0
            )

        earned = total_revenue * float(self.revenue_percentage) / 100

        withdrawn = float(
            self.withdrawal_requests.filter(
                status=WithdrawalRequest.Status.APPROVED
            ).aggregate(t=models.Sum('amount'))['t'] or 0
        )
        return round(earned - withdrawn, 2)

    @property
    def total_earned(self):
        from apps.payments.models import Payment
        total_revenue = 0
        if self.event and self.event.is_paid:
            total_revenue = float(
                Payment.objects.filter(
                    event=self.event, status='success'
                ).aggregate(t=models.Sum('amount'))['t'] or 0
            )
        elif self.ticket_event:
            from apps.tickets.models import Ticket
            total_revenue = float(
                Ticket.objects.filter(
                    tier__event=self.ticket_event, status__in=['paid', 'used']
                ).aggregate(t=models.Sum('total_amount'))['t'] or 0
            )
        return round(total_revenue * float(self.revenue_percentage) / 100, 2)

    @property
    def total_withdrawn(self):
        return float(
            self.withdrawal_requests.filter(
                status=WithdrawalRequest.Status.APPROVED
            ).aggregate(t=models.Sum('amount'))['t'] or 0
        )


class WithdrawalRequest(models.Model):
    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        APPROVED = 'approved', 'Approved'
        DECLINED = 'declined', 'Declined'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    official    = models.ForeignKey(
        Official, on_delete=models.CASCADE, related_name='withdrawal_requests'
    )
    amount      = models.DecimalField(max_digits=10, decimal_places=2)
    note        = models.TextField(blank=True, help_text='Optional note from the official.')

    # Payment details — where to send the money
    PAYMENT_METHOD_CHOICES = [
        ('mtn_momo',    'MTN Mobile Money'),
        ('telecel',     'Telecel Cash'),
        ('at_money',    'AirtelTigo Money'),
        ('bank',        'Bank Transfer'),
        ('other',       'Other'),
    ]
    payment_method         = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, blank=True)
    payment_account_name   = models.CharField(max_length=200, blank=True, help_text='Account/MoMo name')
    payment_account_number = models.CharField(max_length=50, blank=True, help_text='Account/MoMo number')

    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    admin_note  = models.TextField(blank=True, help_text='Admin response note.')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_withdrawals'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'withdrawal_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.official.name} — {self.amount} ({self.status})'


class OfficialOTP(models.Model):
    """Short-lived OTP for official login (phone-based)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone      = models.CharField(max_length=30)
    code       = models.CharField(max_length=6)
    is_used    = models.BooleanField(default=False)
    attempts   = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'official_otps'
        ordering = ['-created_at']

    def __str__(self):
        return f'OfficialOTP {self.phone} — used={self.is_used}'
