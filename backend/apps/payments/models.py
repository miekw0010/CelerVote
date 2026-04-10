import uuid
import hashlib
import hmac
import requests
from django.conf import settings
from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        SUCCESS  = 'success',  'Success'
        FAILED   = 'failed',   'Failed'
        REFUNDED = 'refunded', 'Refunded'

    class Channel(models.TextChoices):
        CARD         = 'card',          'Card'
        MOBILE_MONEY = 'mobile_money',  'Mobile Money'
        BANK         = 'bank_transfer', 'Bank Transfer'

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='payments'
    )
    event        = models.ForeignKey(
        'events.Event', on_delete=models.CASCADE, related_name='payments'
    )
    reference    = models.CharField(max_length=100, unique=True)
    amount       = models.DecimalField(max_digits=10, decimal_places=2)
    currency     = models.CharField(max_length=5, default='GHS')
    channel      = models.CharField(max_length=20, choices=Channel.choices, blank=True)
    status       = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    paystack_id  = models.CharField(max_length=100, blank=True)
    paystack_data= models.JSONField(default=dict)
    votes_bought = models.IntegerField(default=1)
    email        = models.EmailField()
    phone        = models.CharField(max_length=20, blank=True)
    category_id  = models.UUIDField(null=True, blank=True)
    candidate_id = models.UUIDField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-created_at']

    def __str__(self):
        return f'Payment {self.reference} — {self.status}'


class PaystackService:
    BASE_URL = settings.PAYSTACK_BASE_URL
    SECRET   = settings.PAYSTACK_SECRET_KEY

    @property
    def headers(self):
        return {
            'Authorization': f'Bearer {self.SECRET}',
            'Content-Type':  'application/json',
        }

    def initialize_transaction(self, email, amount_ghs, reference, metadata=None, callback_url=''):
        payload = {
            'email':        email,
            'amount':       int(float(amount_ghs) * 100),
            'reference':    reference,
            'currency':     'GHS',
            'callback_url': callback_url,
            'metadata':     metadata or {},
            'channels':     ['card', 'mobile_money', 'bank_transfer'],
        }
        resp = requests.post(
            f'{self.BASE_URL}/transaction/initialize',
            json=payload, headers=self.headers, timeout=30
        )
        return resp.json()

    def verify_transaction(self, reference):
        resp = requests.get(
            f'{self.BASE_URL}/transaction/verify/{reference}',
            headers=self.headers, timeout=30
        )
        return resp.json()

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        expected = hmac.new(self.SECRET.encode(), payload, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature)