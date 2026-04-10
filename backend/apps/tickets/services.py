import uuid
import requests
import logging
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from .models import TicketEvent, TicketTier, Ticket

logger = logging.getLogger(__name__)

PAYSTACK_SECRET = settings.PAYSTACK_SECRET_KEY
PAYSTACK_BASE   = settings.PAYSTACK_BASE_URL


def initiate_ticket_payment(tier_id, quantity, buyer_name, buyer_email, buyer_phone, user):
    """Create a pending ticket order and initialize Paystack payment."""
    tier  = TicketTier.objects.select_related('event').get(id=tier_id)
    event = tier.event

    # Reject if event is no longer active or published
    if not event.is_active or not event.is_published:
        raise ValueError('This event is not available for ticket purchases.')

    # Reject if the event date has already passed
    if event.event_date < timezone.now():
        raise ValueError('This event has already taken place. Ticket purchases are closed.')

    # Reject if end_date is set and has passed
    if event.end_date and event.end_date < timezone.now():
        raise ValueError('Ticket sales for this event have ended.')

    # Reject if tier is inactive
    if not tier.is_active:
        raise ValueError('This ticket tier is no longer available.')

    if tier.tickets_remaining < quantity:
        raise ValueError(f'Only {tier.tickets_remaining} tickets remaining.')

    # Create ONE pending order ticket — will be split into individual tickets on payment success
    # If no email provided, generate a dummy from phone for Paystack
    if not buyer_email:
        phone_clean = (buyer_phone or '').replace('+', '').replace(' ', '')
        buyer_email = f'{phone_clean}@celervote.com'

    ticket = Ticket.objects.create(
        tier         = tier,
        buyer        = user,
        buyer_name   = buyer_name,
        buyer_email  = buyer_email,
        buyer_phone  = buyer_phone or '',
        quantity     = quantity,
        total_amount = tier.price * quantity,
        status       = 'pending',
    )

    reference           = f"TKT-{uuid.uuid4().hex[:12].upper()}"
    ticket.paystack_ref = reference
    ticket.save(update_fields=['paystack_ref'])

    amount_kobo = int(float(tier.price) * quantity * 100)

    payload = {
        'email':     buyer_email,
        'amount':    amount_kobo,
        'reference': reference,
        'currency':  'GHS',
        'metadata': {
            'ticket_id':   str(ticket.id),
            'ticket_code': ticket.ticket_code,
            'tier_name':   tier.name,
            'event_title': tier.event.title,
            'buyer_name':  buyer_name,
            'buyer_phone': buyer_phone or '',
            'quantity':    quantity,
            'type':        'ticket_purchase',
        },
    }

    headers = {
        'Authorization': f'Bearer {PAYSTACK_SECRET}',
        'Content-Type':  'application/json',
    }

    res  = requests.post('https://api.paystack.co/transaction/initialize', json=payload, headers=headers)
    data = res.json()

    if not data.get('status'):
        ticket.delete()
        raise ValueError(data.get('message', 'Payment initialization failed.'))

    return {
        'ticket_id':           str(ticket.id),
        'ticket_code':         ticket.ticket_code,
        'reference':           reference,
        'authorization_url':   data['data']['authorization_url'],
        'access_code':         data['data']['access_code'],
        'amount':              float(tier.price) * quantity,
    }


def verify_ticket_payment(reference):
    """Verify payment with Paystack and create one individual ticket per quantity purchased."""
    headers = {'Authorization': f'Bearer {PAYSTACK_SECRET}'}
    res     = requests.get(f'https://api.paystack.co/transaction/verify/{reference}', headers=headers)
    data    = res.json()

    if not data.get('status') or data['data']['status'] != 'success':
        return None, "Payment verification failed."

    try:
        order = Ticket.objects.select_related('tier__event', 'buyer').get(paystack_ref=reference)
    except Ticket.DoesNotExist:
        return None, "Ticket not found."

    if order.status == 'paid':
        # Return all tickets belonging to this order (order ticket + any extras)
        all_order_tickets = list(Ticket.objects.filter(
            buyer_email=order.buyer_email,
            tier=order.tier,
            status='paid',
            paystack_ref__startswith=reference,
        ).order_by('created_at'))
        return all_order_tickets or [order], "already_paid"

    quantity = order.quantity  # save before we overwrite it
    paid_at  = timezone.now()

    with transaction.atomic():
        # Convert the order ticket into individual ticket #1 (qty 1, not qty N)
        order.status       = 'paid'
        order.paid_at      = paid_at
        order.quantity     = 1
        order.total_amount = order.tier.price
        order.generate_qr_code()
        order.save()

        # Create individual tickets #2 through #N, each with a unique code & QR
        extra_tickets = []
        for i in range(1, quantity):
            extra = Ticket(
                tier         = order.tier,
                buyer        = order.buyer,
                buyer_name   = order.buyer_name,
                buyer_email  = order.buyer_email,
                buyer_phone  = order.buyer_phone,
                quantity     = 1,
                total_amount = order.tier.price,
                status       = 'paid',
                paid_at      = paid_at,
                paystack_ref = f"{reference}-{i}",
            )
            extra.save()  # triggers unique ticket_code generation via model.save()
            extra.generate_qr_code()
            extra.save(update_fields=['qr_code'])
            extra_tickets.append(extra)

    # Send ONE confirmation email listing all tickets
    try:
        from .tasks import send_ticket_order_confirmation_task
        all_ticket_ids = [str(order.id)] + [str(t.id) for t in extra_tickets]
        try:
            send_ticket_order_confirmation_task.apply_async(
                args=[all_ticket_ids],
                countdown=2,
            )
        except Exception:
            # Celery not running — call synchronously so email still goes out
            logger.warning("Celery unavailable — sending ticket email synchronously")
            send_ticket_order_confirmation_task(all_ticket_ids)
    except Exception as e:
        logger.warning(f"Could not send ticket notification: {e}")

    all_tickets = [order] + extra_tickets
    return all_tickets, "success"


def get_ticket_stats(event_id):
    """Get ticket sales stats for admin dashboard."""
    from django.db.models import Sum
    tiers = TicketTier.objects.filter(event_id=event_id)
    stats = []
    for tier in tiers:
        sold_count = Ticket.objects.filter(
            tier=tier,
            status__in=['paid', 'used']
        ).aggregate(total=Sum('quantity'))['total'] or 0

        stats.append({
            'tier_id':   str(tier.id),
            'tier_name': tier.name,
            'price':     float(tier.price),
            'quantity':  tier.quantity,
            'sold':      sold_count,
            'remaining': tier.quantity - sold_count,
            'revenue':   float(tier.price) * sold_count,
        })
    return stats
