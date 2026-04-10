import hashlib
import hmac
import json
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser, BasePermission

class IsAdminOrSuperAdmin(BasePermission):
    """Allows access to users with admin or superadmin role."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role in ['admin', 'superadmin']
        )
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_ratelimit.decorators import ratelimit
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from .models import TicketEvent, TicketTier, Ticket

logger = logging.getLogger(__name__)


def verify_paystack_signature(request_body: bytes, signature_header: str) -> bool:
    secret   = settings.PAYSTACK_SECRET_KEY.encode('utf-8')
    expected = hmac.new(secret, request_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature_header)
from .serializers import (
    TicketEventListSerializer, TicketEventCreateSerializer,
    TicketEventUpdateSerializer, TicketTierSerializer,
    TicketTierCreateSerializer, TicketSerializer, TicketPurchaseSerializer,
)
from .services import initiate_ticket_payment, verify_ticket_payment, get_ticket_stats


# ── Public ────────────────────────────────────────────────────────────────────

class TicketEventListView(APIView):
    permission_classes  = [AllowAny]
    authentication_classes = []

    def get(self, request):
        events = TicketEvent.objects.filter(is_active=True, is_published=True).prefetch_related('tiers')
        return Response(TicketEventListSerializer(events, many=True).data)


class TicketEventDetailView(APIView):
    permission_classes  = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug, is_active=True, is_published=True)
        return Response(TicketEventListSerializer(event).data)


# ── Purchase ──────────────────────────────────────────────────────────────────

@method_decorator(ratelimit(key='ip', rate='20/h', method='POST', block=True), name='post')
class InitiateTicketPaymentView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TicketPurchaseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            result = initiate_ticket_payment(
                tier_id     = data['tier_id'],
                quantity    = data['quantity'],
                buyer_name  = data['buyer_name'],
                buyer_email = data['buyer_email'],
                buyer_phone = data.get('buyer_phone', ''),
                user        = request.user if request.user.is_authenticated else None,
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': 'Payment initialization failed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(ratelimit(key='ip', rate='60/h', method='POST', block=True), name='post')
class VerifyTicketPaymentView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        reference = request.data.get('reference', '').strip()
        if not reference:
            return Response({'error': 'Reference is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Reject references we never created — prevents reference injection
        try:
            ticket_check = Ticket.objects.get(paystack_ref=reference)
        except Ticket.DoesNotExist:
            logger.warning(f"Verify attempt with unknown reference: {reference}")
            return Response({'error': 'Invalid reference.'}, status=status.HTTP_400_BAD_REQUEST)

        # Already paid — return early without hitting Paystack API again
        if ticket_check.status == 'paid':
            all_tickets = list(Ticket.objects.filter(
                tier=ticket_check.tier,
                buyer_email=ticket_check.buyer_email,
                status='paid',
                paystack_ref__startswith=reference,
            ).order_by('created_at'))
            return Response({
                'status':  'already_paid',
                'message': 'Ticket already confirmed.',
                'tickets': TicketSerializer(all_tickets or [ticket_check], many=True).data,
                'ticket':  TicketSerializer(ticket_check).data,  # keep for backward compat
            })

        try:
            ticket, result = verify_ticket_payment(reference)
        except Exception as e:
            logger.error(f"verify_ticket_payment crashed: {e}", exc_info=True)
            return Response({'error': 'Verification failed. Please contact support.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        if result == 'success':
            tickets_list = ticket if isinstance(ticket, list) else [ticket]
            return Response({
                'status':  'success',
                'message': 'Ticket confirmed!',
                'tickets': TicketSerializer(tickets_list, many=True).data,
                'ticket':  TicketSerializer(tickets_list[0]).data,  # backward compat
            })
        elif result == 'already_paid':
            tickets_list = ticket if isinstance(ticket, list) else [ticket]
            return Response({
                'status':  'already_paid',
                'message': 'Ticket already confirmed.',
                'tickets': TicketSerializer(tickets_list, many=True).data,
                'ticket':  TicketSerializer(tickets_list[0]).data,
            })
        else:
            return Response({'status': 'failed', 'message': result}, status=status.HTTP_400_BAD_REQUEST)


# ── My Tickets ────────────────────────────────────────────────────────────────

class MyTicketsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tickets = Ticket.objects.filter(buyer=request.user).select_related('tier__event').order_by('-created_at')
        return Response(TicketSerializer(tickets, many=True).data)


class TicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_code):
        ticket = get_object_or_404(Ticket, ticket_code=ticket_code, buyer=request.user)
        return Response(TicketSerializer(ticket).data)


# ── Admin ─────────────────────────────────────────────────────────────────────

class AdminTicketEventListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        events = TicketEvent.objects.all().prefetch_related('tiers').order_by('-created_at')
        return Response(TicketEventListSerializer(events, many=True).data)

    def post(self, request):
        serializer = TicketEventCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            event = serializer.save()
            return Response(TicketEventListSerializer(event).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminTicketEventDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug)
        return Response(TicketEventListSerializer(event).data)

    def patch(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug)
        serializer = TicketEventUpdateSerializer(event, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(TicketEventListSerializer(event).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug)
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminTicketTierView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]

    def post(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug)
        serializer = TicketTierCreateSerializer(data=request.data)
        if serializer.is_valid():
            tier = serializer.save(event=event)
            return Response(TicketTierSerializer(tier).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, slug, tier_id):
        tier = get_object_or_404(TicketTier, id=tier_id, event__slug=slug)
        serializer = TicketTierCreateSerializer(tier, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(TicketTierSerializer(tier).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, tier_id):
        tier = get_object_or_404(TicketTier, id=tier_id, event__slug=slug)
        tier.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminAllTicketsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]

    def get(self, request):
        event_slug = request.query_params.get('event')
        tickets = Ticket.objects.select_related('tier__event', 'buyer').order_by('-created_at')
        if event_slug:
            tickets = tickets.filter(tier__event__slug=event_slug)
        return Response(TicketSerializer(tickets, many=True).data)


class AdminTicketStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]

    def get(self, request, slug):
        event = get_object_or_404(TicketEvent, slug=slug)
        stats = get_ticket_stats(str(event.id))
        return Response({
            'event_id':    str(event.id),
            'event_title': event.title,
            'total_sold':  event.total_tickets_sold,
            'total_revenue': float(event.total_revenue),
            'tiers':       stats,
        })


class AdminVerifyTicketView(APIView):
    """Scan QR code at entrance to mark ticket as used."""
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin]

    def post(self, request):
        ticket_code = request.data.get('ticket_code')
        if not ticket_code:
            return Response({'error': 'Ticket code required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ticket = Ticket.objects.select_related('tier__event').get(ticket_code=ticket_code)
        except Ticket.DoesNotExist:
            return Response({'valid': False, 'message': 'Invalid ticket code.'}, status=status.HTTP_404_NOT_FOUND)

        if ticket.status == 'used':
            return Response({'valid': False, 'message': 'Ticket already used.', 'ticket': TicketSerializer(ticket).data})

        if ticket.status != 'paid':
            return Response({'valid': False, 'message': f'Ticket status: {ticket.status}.', 'ticket': TicketSerializer(ticket).data})

        ticket.status = 'used'
        ticket.save(update_fields=['status'])

        return Response({
            'valid':   True,
            'message': 'Ticket verified and marked as used.',
            'ticket':  TicketSerializer(ticket).data,
        })

@method_decorator(csrf_exempt, name='dispatch')
class PaystackWebhookView(APIView):
    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request):
        signature = request.META.get('HTTP_X_PAYSTACK_SIGNATURE', '')
        if not signature:
            return HttpResponse(status=400)

        raw_body = request.body
        if not verify_paystack_signature(raw_body, signature):
            logger.warning("Paystack webhook signature verification FAILED")
            return HttpResponse(status=401)

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            return HttpResponse(status=400)

        event_type = payload.get('event')
        data       = payload.get('data', {})
        logger.info(f"Paystack webhook received: {event_type}")

        if event_type == 'charge.success':
            reference = data.get('reference', '')
            if reference and Ticket.objects.filter(paystack_ref=reference).exists():
                ticket, result = verify_ticket_payment(reference)
                logger.info(f"Webhook result for {reference}: {result}")

        return HttpResponse(status=200)


