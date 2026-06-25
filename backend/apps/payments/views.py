import uuid
import json
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit

from apps.events.models import Event
from .models import Payment, NaloCheckoutService
from .serializers import InitializePaymentSerializer, PaymentSerializer

logger = logging.getLogger(__name__)
nalo_checkout = NaloCheckoutService()


class InitializePaymentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    @method_decorator(ratelimit(key='ip', rate='30/h', method='POST', block=True))
    def post(self, request):
        serializer = InitializePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data  = serializer.validated_data
        event = get_object_or_404(Event, slug=data['event_slug'])

        if not event.is_paid:
            return Response({'error': 'This event does not require payment.'}, status=400)

        if not event.is_open:
            return Response({'error': 'Voting is closed for this event. Payments are no longer accepted.'}, status=400)

        votes_count  = data.get('votes_count', 1)
        amount       = float(event.price_per_vote) * votes_count
        reference    = f'EVOTE-{uuid.uuid4().hex[:12].upper()}'
        email        = data.get('email') or (request.user.email if request.user.is_authenticated else '')
        phone        = data.get('phone', '') or (getattr(request.user, 'phone', '') if request.user.is_authenticated else '')
        category_id  = data.get('category_id')
        candidate_id = data.get('candidate_id')

        # Phone-only users have a fake local email — replace with a clean dummy
        if email and (email.endswith('@phone.evoting.local') or email.endswith('@ussd.evoting.local')):
            phone_clean = phone.replace('+', '').replace(' ', '') if phone else ''
            email = f'{phone_clean}@celervote.com' if phone_clean else ''

        # Guest voters — build email from phone if email still missing
        if not email and phone:
            phone_clean = phone.replace('+', '').replace(' ', '')
            email = f'{phone_clean}@celervote.com'

        if not email:
            return Response({'error': 'Phone number is required to proceed with payment.'}, status=400)

        payment = Payment.objects.create(
            user=request.user if request.user.is_authenticated else None,
            event=event,
            reference=reference,
            amount=amount,
            currency=event.currency,
            votes_bought=votes_count,
            email=email,
            phone=phone,
            category_id=category_id,
            candidate_id=candidate_id,
        )

        # Build absolute callback URL for Nalo's webhook (must be publicly reachable)
        backend_url = getattr(settings, 'BACKEND_URL', '') or request.build_absolute_uri('/').rstrip('/')
        callback_url = f'{backend_url}/api/v1/payments/webhook/nalo-checkout/'
        referral_url = data.get('callback_url') or request.build_absolute_uri('/')

        customer_name = (
            getattr(request.user, 'get_full_name', lambda: '')() if request.user.is_authenticated else ''
        ) or 'Voter'

        result = nalo_checkout.create_checkout_session(
            order_id=reference,
            reference=reference,
            amount_ghs=amount,
            customer_name=customer_name,
            referral_url=referral_url,
            callback_url=callback_url,
            products=[{
                'name':  f'{votes_count} vote(s) for {event.title}'[:120],
                'count': votes_count,
                'price': f'{float(event.price_per_vote):.2f}',
            }],
        )

        if not result.get('success'):
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=['status'])
            return Response({'error': result.get('error', 'Payment initialization failed.')}, status=400)

        return Response({
            'reference':    reference,
            'checkout_url': result['checkout_url'],
            'amount':       amount,
            'currency':     event.currency,
        })


class VerifyPaymentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, reference):
        payment = get_object_or_404(Payment, reference=reference)

        if payment.status == Payment.Status.SUCCESS:
            return Response({
                'status':       'success',
                'reference':    reference,
                'votes_bought': payment.votes_bought,
                'message':      'Payment already verified.',
            })

        # Fallback: ask Nalo directly in case the webhook hasn't landed yet
        result = nalo_checkout.check_status(order_id=reference)

        if result.get('success') and result.get('status') == 'COMPLETED':
            payment.status = Payment.Status.SUCCESS
            payment.save(update_fields=['status'])
            return Response({
                'status':       'success',
                'reference':    reference,
                'votes_bought': payment.votes_bought,
                'message':      f'Payment successful! You can now cast {payment.votes_bought} vote(s).',
            })

        return Response({
            'status':      'pending',
            'nalo_status': result.get('status', 'unknown'),
            'message':     'Payment not yet confirmed. Please wait — your vote will be recorded automatically.',
        }, status=200)


class PaymentStatusView(APIView):
    """
    Polled by PaymentModal every 5 seconds to detect when webhook has
    completed and votes have been cast. Returns votes_cast count so the
    frontend can show success without waiting for the frontend castVote()
    call to succeed.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, reference):
        from apps.voting.models import Vote

        try:
            payment = Payment.objects.get(reference=reference)
        except Payment.DoesNotExist:
            logger.warning(f'PaymentStatusView: not found ref={reference}')
            return Response({
                'error':      'Payment not found',
                'reference':  reference,
                'votes_cast': 0,
                'status':     'not_found',
            }, status=404)

        votes_cast = Vote.objects.filter(payment_ref=reference).count()
        logger.info(f'PaymentStatusView: ref={reference} votes_cast={votes_cast} status={payment.status}')

        return Response({
            'reference':      reference,
            'payment_status': payment.status,
            'votes_cast':     votes_cast,
            'amount':         str(payment.amount),
            'currency':       payment.currency,
            'status':         'success' if votes_cast > 0 or payment.status == 'success' else payment.status,
        })


@method_decorator(csrf_exempt, name='dispatch')
class NaloCheckoutWebhookView(APIView):
    """
    Handles Nalo Hosted Checkout callbacks. Payload shape (per NALOPAY docs)
    is DIFFERENT from the USSD collections callback:
        {"order_id": "...", "status": "COMPLETED"|"FAILED", "amount": "50.00", ...}
    We set order_id == our internal reference at checkout-session creation
    time, so order_id IS the Payment.reference — no separate mapping needed.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            payload = json.loads(request.body) if request.body else request.data
        except Exception:
            payload = request.data

        order_id = payload.get('order_id', '')
        status   = payload.get('status', '')
        logger.info(f'Nalo checkout webhook: order_id={order_id} status={status}')

        if not order_id:
            return Response({'status': 'error', 'message': 'order_id missing'}, status=400)

        try:
            payment = Payment.objects.get(reference=order_id)
        except Payment.DoesNotExist:
            logger.warning(f'Nalo checkout webhook: no Payment found for order_id={order_id}')
            return Response({'status': 'error', 'message': 'reference not found'}, status=404)

        if status != 'COMPLETED':
            if status == 'FAILED' and payment.status == Payment.Status.PENDING:
                payment.status = Payment.Status.FAILED
                payment.paystack_data = payload
                payment.save(update_fields=['status', 'paystack_data'])
            return Response({'status': 'ok'})

        # ── 1. Mark Payment record as SUCCESS (idempotent) ──────────────────
        if payment.status != Payment.Status.SUCCESS:
            payment.status        = Payment.Status.SUCCESS
            payment.channel       = Payment.Channel.MOBILE_MONEY if not payload.get('email') else Payment.Channel.CARD
            payment.paystack_data = payload
            payment.save()

        # ── 2. Auto-cast the vote if it hasn't been cast yet ─────────────────
        if payment.category_id and payment.candidate_id:
            from apps.voting.models import Vote
            already_cast = Vote.objects.filter(payment_ref=order_id).exists()
            if not already_cast:
                try:
                    from apps.voting.services import VoteCaster
                    caster = VoteCaster(
                        event=payment.event,
                        voter=payment.user,
                        request=None,
                        ip='127.0.0.1',
                    )
                    result = caster.cast_vote(
                        category_id=str(payment.category_id),
                        candidate_ids=[str(payment.candidate_id)],
                        payment_ref=order_id,
                        quantity=payment.votes_bought or 1,
                    )
                    if result.get('success'):
                        logger.info(f'Nalo checkout webhook: vote cast for ref={order_id}')
                    else:
                        logger.warning(f'Nalo checkout webhook: cast_vote returned error for ref={order_id}: {result.get("error")}')
                except Exception as exc:
                    logger.error(f'Nalo checkout webhook: exception casting vote for ref={order_id}: {exc}')

        # ── 3. Handle ticket purchases ────────────────────────────────────────
        from apps.tickets.models import Ticket as TicketModel
        from apps.tickets.services import verify_ticket_payment
        if TicketModel.objects.filter(paystack_ref=order_id, status='pending').exists():
            try:
                verify_ticket_payment(order_id)
            except Exception as e:
                logger.error(f'Nalo checkout webhook: ticket verify failed for {order_id}: {e}')

        return Response({'status': 'ok'})


class PaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        payments   = Payment.objects.filter(user=request.user).order_by('-created_at')
        serializer = PaymentSerializer(payments, many=True)
        return Response(serializer.data)


class AdminPaymentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        payments = Payment.objects.filter(event=event).order_by('-created_at')
        from django.db.models import Sum, Count
        stats = payments.filter(status=Payment.Status.SUCCESS).aggregate(
            total_revenue=Sum('amount'),
            total_transactions=Count('id'),
        )
        return Response({
            'stats':    stats,
            'payments': PaymentSerializer(payments, many=True).data,
        })
