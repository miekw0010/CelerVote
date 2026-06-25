import uuid
import hashlib
import hmac
import logging
import requests
from django.conf import settings
from django.db import models

logger = logging.getLogger(__name__)


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
    """Kept for reference / rollback. Not used while Paystack is blocked."""
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


class NaloCheckoutService:
    """
    NALOPAY Hosted Checkout API — used for web payments now that Paystack
    is blocked. Same credential set as USSD (NALO_CLIENT_ID, NALO_CLIENT_SECRET,
    NALOPAY_MERCHANT_ID) — Nalo issues one credential pair per merchant
    account, shared across Collections, Checkout, and status-check endpoints.

    IMPORTANT: the trans_hash formula here is DIFFERENT from the one used
    for USSD/Collections in apps/ussd/views.py:
      - Collections (USSD):  merchant_id + account_number + amount + reference
      - Hosted Checkout:     merchant_id + order_id      + total_price + reference
    Do not reuse the USSD hash function for checkout sessions — it will
    produce a hash Nalo rejects.
    """
    TOKEN_URL    = 'https://api.nalopay.com/clientapi/generate-payment-token/'
    CHECKOUT_URL = 'https://api.nalopay.com/checkout/session/'
    STATUS_URL   = 'https://api.nalopay.com/clientapi/collection-status/'

    def __init__(self):
        self.auth_key     = getattr(settings, 'NALO_CLIENT_ID', '')
        self.secret_key   = getattr(settings, 'NALO_CLIENT_SECRET', '')
        self.merchant_id  = getattr(settings, 'NALOPAY_MERCHANT_ID', '')

    def _get_token(self):
        if not self.auth_key or not self.merchant_id:
            logger.error('NaloCheckoutService: NALO_CLIENT_ID or NALOPAY_MERCHANT_ID missing')
            return None
        try:
            resp = requests.post(
                self.TOKEN_URL,
                json={'merchant_id': self.merchant_id},
                headers={
                    'Authorization': self.auth_key,  # already "Basic xxxx" in env var
                    'Content-Type':  'application/json',
                },
                timeout=30,
            )
            data = resp.json()
            token = data.get('data', {}).get('token')
            if not token:
                logger.error(f'NaloCheckoutService: could not extract token, resp={data}')
            return token
        except Exception as e:
            logger.error(f'NaloCheckoutService: token request failed: {e}')
            return None

    def _generate_trans_hash(self, order_id, total_price, reference):
        """
        Hosted Checkout hash formula (per NALOPAY docs):
        HMAC_SHA256(merchant_id + order_id + total_price + reference, secret_key)
        total_price must be the EXACT string sent in the request body.
        """
        if not self.secret_key:
            logger.error('NaloCheckoutService: NALO_CLIENT_SECRET missing for trans_hash')
            return ''
        message = f'{self.merchant_id}{order_id}{total_price}{reference}'
        trans_hash = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256,
        ).hexdigest()
        logger.info(f'NaloCheckoutService: trans_hash message={message!r} -> {trans_hash[:24]}...')
        return trans_hash

    def create_checkout_session(self, order_id, reference, amount_ghs, customer_name,
                                 referral_url, callback_url, products=None):
        """
        Creates a Nalo hosted checkout session.
        Returns dict: {'success': bool, 'checkout_url': str|None, 'error': str|None}
        """
        token = self._get_token()
        if not token:
            return {'success': False, 'checkout_url': None, 'error': 'Could not authenticate with Nalo.'}

        total_price = f'{float(amount_ghs):.2f}'
        trans_hash = self._generate_trans_hash(order_id, total_price, reference)
        if not trans_hash:
            return {'success': False, 'checkout_url': None, 'error': 'Could not sign checkout request.'}

        products = products or [{'name': 'Vote(s)', 'count': 1, 'price': total_price}]

        payload = {
            'merchant': {
                'merchant_id':   self.merchant_id,
                'order_id':      order_id,
                'customer_name': customer_name or 'Voter',
                'referral_url':  referral_url,
                'callback_url':  callback_url,
                'trans_hash':    trans_hash,
                'reference':     reference,
                'mode':          'MOMO',
            },
            'summary': {
                'products':   products,
                'item_count': sum(p.get('count', 1) for p in products),
                'total_price': total_price,
            },
        }

        try:
            resp = requests.post(
                self.CHECKOUT_URL,
                json=payload,
                headers={'token': token, 'Content-Type': 'application/json'},
                timeout=30,
            )
            data = resp.json()
            if data.get('success') and data.get('data', {}).get('checkout_url'):
                return {
                    'success':      True,
                    'checkout_url': data['data']['checkout_url'],
                    'timeout':      data['data'].get('checkout_timeout', 1800),
                    'error':        None,
                }
            logger.error(f'NaloCheckoutService: checkout session failed, resp={data}')
            return {'success': False, 'checkout_url': None, 'error': data.get('message') or 'Checkout session could not be created.'}
        except Exception as e:
            logger.error(f'NaloCheckoutService: checkout request exception: {e}')
            return {'success': False, 'checkout_url': None, 'error': 'Could not reach payment provider.'}

    def check_status(self, order_id):
        """Fallback poll — use if webhook is delayed."""
        if not self.merchant_id:
            return {'success': False, 'status': 'unknown'}
        try:
            resp = requests.post(
                self.STATUS_URL,
                json={'merchant_id': self.merchant_id, 'order_id': order_id},
                headers={'Content-Type': 'application/json'},
                timeout=20,
            )
            data = resp.json()
            if data.get('success'):
                return {'success': True, 'status': data['data'].get('status', 'unknown'), 'amount': data['data'].get('amount')}
            return {'success': False, 'status': 'unknown'}
        except Exception as e:
            logger.error(f'NaloCheckoutService: status check failed: {e}')
            return {'success': False, 'status': 'unknown'}
