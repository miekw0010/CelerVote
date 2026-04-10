import uuid
import qrcode
import io
from django.db import models
from django.conf import settings
from cloudinary_storage.storage import MediaCloudinaryStorage


def ticket_banner_path(instance, filename):
    return f'ticket_events/{instance.slug}/{filename}'


class TicketEvent(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title       = models.CharField(max_length=255)
    slug        = models.SlugField(unique=True, max_length=255)
    description = models.TextField(blank=True)
    venue       = models.CharField(max_length=255)
    event_date  = models.DateTimeField()
    end_date    = models.DateTimeField(null=True, blank=True)
    banner      = models.ImageField(upload_to=ticket_banner_path, null=True, blank=True, storage=MediaCloudinaryStorage())
    organizer   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ticket_events')
    is_active   = models.BooleanField(default=True)
    is_published = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-event_date']

    def __str__(self):
        return self.title

    @property
    def total_tickets_sold(self):
        from django.db.models import Sum
        result = Ticket.objects.filter(
            tier__event=self, status__in=['paid', 'used']
        ).aggregate(total=Sum('quantity'))
        return result['total'] or 0

    @property
    def total_revenue(self):
        from django.db.models import Sum
        result = Ticket.objects.filter(
            tier__event=self, status__in=['paid', 'used']
        ).aggregate(total=Sum('total_amount'))
        return result['total'] or 0


class TicketTier(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event        = models.ForeignKey(TicketEvent, on_delete=models.CASCADE, related_name='tiers')
    name         = models.CharField(max_length=100)  # VIP, Regular, VVIP, Early Bird etc
    description  = models.TextField(blank=True)
    price        = models.DecimalField(max_digits=10, decimal_places=2)
    quantity     = models.PositiveIntegerField()
    perks        = models.JSONField(default=list, blank=True)  # list of perk strings
    color        = models.CharField(max_length=20, default='#14b8a6')  # for UI badge
    order        = models.PositiveIntegerField(default=0)
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'price']

    def __str__(self):
        return f"{self.event.title} — {self.name}"

    @property
    def tickets_sold(self):
        from django.db.models import Sum
        result = self.tickets.filter(status__in=['paid', 'used']).aggregate(total=Sum('quantity'))
        return result['total'] or 0

    @property
    def tickets_remaining(self):
        return max(0, self.quantity - self.tickets_sold)

    @property
    def is_sold_out(self):
        return self.tickets_remaining == 0


class Ticket(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid',    'Paid'),
        ('used',    'Used'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tier            = models.ForeignKey(TicketTier, on_delete=models.CASCADE, related_name='tickets')
    buyer           = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tickets', null=True, blank=True)
    buyer_name      = models.CharField(max_length=255)
    buyer_email     = models.EmailField()
    buyer_phone     = models.CharField(max_length=30, blank=True)
    ticket_code     = models.CharField(max_length=20, unique=True)
    qr_code         = models.ImageField(upload_to='ticket_qrcodes/', null=True, blank=True, storage=MediaCloudinaryStorage())
    paystack_ref    = models.CharField(max_length=100, blank=True)
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    quantity        = models.PositiveIntegerField(default=1)
    total_amount    = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notifications_sent = models.JSONField(default=dict)  # track which notifications sent
    created_at      = models.DateTimeField(auto_now_add=True)
    paid_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.ticket_code} — {self.buyer_name}"

    def generate_ticket_code(self):
        import random, string
        prefix = self.tier.event.title[:3].upper().replace(' ', '')
        chars  = string.ascii_uppercase + string.digits
        suffix = ''.join(random.choices(chars, k=8))
        return f"{prefix}-{suffix}"

    def generate_qr_code(self):
        """Generate QR code and upload to Cloudinary."""
        qr_data = (
            f"CELERVOTE TICKET\n"
            f"Code: {self.ticket_code}\n"
            f"Event: {self.tier.event.title}\n"
            f"Tier: {self.tier.name}\n"
            f"Buyer: {self.buyer_name}\n"
            f"Date: {self.tier.event.event_date.strftime('%d %b %Y %H:%M')}\n"
            f"Venue: {self.tier.event.venue}"
        )
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0f172a", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        filename = f"ticket_{self.ticket_code}.png"
        from django.core.files.base import ContentFile
        self.qr_code.save(filename, ContentFile(buffer.read()), save=False)

    def save(self, *args, **kwargs):
        if not self.ticket_code:
            self.ticket_code = self.generate_ticket_code()
            # ensure uniqueness
            while Ticket.objects.filter(ticket_code=self.ticket_code).exists():
                self.ticket_code = self.generate_ticket_code()
        if not self.total_amount:
            self.total_amount = self.tier.price * self.quantity
        super().save(*args, **kwargs)

