import uuid
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit

from apps.events.models import Event
from .models import Payment, PaystackService
from .serializers import InitializePaymentSerializer, PaymentSerializer

paystack = PaystackService()


class InitializePaymentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []  # Relies on django-ratelimit below

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

        # Phone-only users have a fake local email — replace with a Paystack-friendly dummy
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

        result = paystack.initialize_transaction(
            email=email,
            amount_ghs=amount,
            reference=reference,
            metadata={
                'event_id':    str(event.id),
                'event_title': event.title,
                'votes_count': votes_count,
                'payment_id':  str(payment.id),
            },
            callback_url=data.get('callback_url', ''),
        )

        if not result.get('status'):
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=['status'])
            return Response({'error': result.get('message', 'Payment initialization failed.')}, status=400)

        return Response({
            'reference':   reference,
            'payment_url': result['data']['authorization_url'],
            'access_code': result['data']['access_code'],
            'amount':      amount,
            'currency':    event.currency,
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

        result = paystack.verify_transaction(reference)

        if result.get('status') and result['data']['status'] == 'success':
            payment.status         = Payment.Status.SUCCESS
            payment.paystack_id    = str(result['data']['id'])
            payment.channel        = result['data'].get('channel', '')
            payment.paystack_data  = result['data']
            payment.save()
            return Response({
                'status':       'success',
                'reference':    reference,
                'votes_bought': payment.votes_bought,
                'message':      f'Payment successful! You can now cast {payment.votes_bought} vote(s).',
            })
        else:
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=['status'])
            return Response({'status': 'failed', 'message': 'Payment verification failed.'}, status=400)


@method_decorator(csrf_exempt, name='dispatch')
class PaystackWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        signature = request.headers.get('X-Paystack-Signature', '')
        if not paystack.verify_webhook_signature(request.body, signature):
            return Response({'error': 'Invalid signature'}, status=401)

        payload = json.loads(request.body)
        event   = payload.get('event')
        data    = payload.get('data', {})

        if event == 'charge.success':
            reference = data.get('reference', '')
            import logging as _wh_log
            _log = _wh_log.getLogger(__name__)

            # ── 1. Mark Payment record as SUCCESS ────────────────────────────
            payment_obj = None
            try:
                payment_obj = Payment.objects.get(reference=reference)
                if payment_obj.status != Payment.Status.SUCCESS:
                    payment_obj.status        = Payment.Status.SUCCESS
                    payment_obj.paystack_id   = str(data.get('id', ''))
                    payment_obj.channel       = data.get('channel', '')
                    payment_obj.paystack_data = data
                    payment_obj.save()
            except Payment.DoesNotExist:
                payment_obj = None

            # ── 2. AUTO-CAST THE VOTE if it hasn't been cast yet ────────────
            # Safety net: if the frontend castVote() call failed for any reason
            # (network drop, Paystack timing race, browser closed), the webhook
            # fires ~1-3s later and casts the vote itself.
            # Idempotency guaranteed by Vote.objects.filter(payment_ref=…) check
            # inside VoteCaster.cast_vote().
            if payment_obj and payment_obj.category_id and payment_obj.candidate_id:
                from apps.voting.models import Vote
                already_cast = Vote.objects.filter(payment_ref=reference).exists()
                if not already_cast:
                    try:
                        from apps.voting.services import VoteCaster
                        caster = VoteCaster(
                            event=payment_obj.event,
                            voter=payment_obj.user,
                            request=None,
                            ip=payment_obj.phone or '0.0.0.0',
                        )
                        result = caster.cast_vote(
                            category_id=str(payment_obj.category_id),
                            candidate_ids=[str(payment_obj.candidate_id)],
                            payment_ref=reference,
                            quantity=payment_obj.votes_bought or 1,
                        )
                        if result.get('success'):
                            _log.info(
                                f'Webhook auto-cast success for ref={reference} '
                                f'cat={payment_obj.category_id} cand={payment_obj.candidate_id}'
                            )
                        else:
                            _log.warning(
                                f'Webhook auto-cast returned error for ref={reference}: '
                                f'{result.get("error")}'
                            )
                    except Exception as exc:
                        _log.error(f'Webhook auto-cast exception for ref={reference}: {exc}')

            # ── 3. Handle ticket purchases ───────────────────────────────────
            from apps.tickets.models import Ticket as TicketModel
            from apps.tickets.services import verify_ticket_payment
            if reference and TicketModel.objects.filter(paystack_ref=reference, status='pending').exists():
                try:
                    verify_ticket_payment(reference)
                except Exception as e:
                    _log.error(f'Webhook ticket verify failed for {reference}: {e}')

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
