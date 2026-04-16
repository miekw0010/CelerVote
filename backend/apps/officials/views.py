import random
import string
from datetime import timedelta

from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle

class OfficialOTPRequestThrottle(AnonRateThrottle):
    scope = 'otp_request'

class OfficialOTPVerifyThrottle(AnonRateThrottle):
    scope = 'otp_verify'

from .models import Official, WithdrawalRequest, OfficialOTP
from .serializers import (
    OfficialSerializer, OfficialCreateSerializer,
    WithdrawalRequestSerializer, WithdrawalCreateSerializer,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(user):
    return user.is_authenticated and user.role in ('admin', 'superadmin')


def _generate_otp():
    return ''.join(random.choices(string.digits, k=6))


def _send_official_otp(phone: str, code: str, name: str):
    """
    Send OTP to official.
    - DEBUG: print to terminal only (Arkesel not connected yet).
    - Production: use Arkesel OTP API (generates+sends its own code).
    """
    from django.conf import settings
    if settings.DEBUG:
        import sys
        print(f"\n{'='*50}", flush=True, file=sys.stdout)
        print(f"  [DEV] Official OTP for {name} ({phone}): {code}", flush=True, file=sys.stdout)
        print(f"{'='*50}\n", flush=True, file=sys.stdout)
    else:
        try:
            from apps.notifications.tasks import arkesel_generate_otp
            arkesel_generate_otp(phone)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f'Arkesel OTP failed for official {phone}: {e}')
            # Fallback: plain SMS with our code
            try:
                from apps.notifications.tasks import send_sms
                send_sms(phone, f'Hello {name}, your CelerVote official login code is: {code}. Valid for 10 minutes.')
            except Exception:
                pass


class IsOfficialPermission:
    """Mixin — returns the Official linked to request.user, or 401."""
    def _get_official(self, request):
        if not request.user.is_authenticated:
            return None
        return Official.objects.filter(user=request.user, is_active=True).first()


# ── Auth: Request OTP ─────────────────────────────────────────────────────────

class OfficialRequestOTPView(APIView):
    """
    Step 1 of official login.
    POST {phone} — validates the phone is a registered official, sends OTP.
    """
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [OfficialOTPRequestThrottle]

    def post(self, request):
        phone = request.data.get('phone', '').strip()
        # Basic sanitization — digits, +, spaces, dashes only
        import re as _re
        if not phone or not _re.match(r'^[\d\s\+\-\(\)]{7,20}$', phone):
            return Response({'error': 'Enter a valid phone number.'}, status=400)

        official = Official.objects.filter(phone=phone, is_active=True).first()
        if not official:
            return Response(
                {'error': 'This number is not registered as an official. Please contact your administrator.'},
                status=404
            )

        # Invalidate any previous unused OTPs for this phone
        OfficialOTP.objects.filter(phone=phone, is_used=False).update(is_used=True)

        code = _generate_otp()
        OfficialOTP.objects.create(
            phone=phone,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        _send_official_otp(phone, code, official.name)

        from django.conf import settings
        response_data: dict = {'detail': 'OTP sent successfully.'}
        if settings.DEBUG:
            response_data['debug_code'] = code

        return Response(response_data)


# ── Auth: Verify OTP & Login ──────────────────────────────────────────────────

class OfficialVerifyOTPView(APIView):
    """
    Step 2 of official login.
    POST {phone, code} — verifies OTP, returns JWT + official profile.
    """
    permission_classes     = [AllowAny]
    authentication_classes = []
    throttle_classes       = [OfficialOTPVerifyThrottle]

    def post(self, request):
        phone = request.data.get('phone', '').strip()
        code  = request.data.get('code', '').strip()

        if not phone or not code:
            return Response({'error': 'Phone and code are required.'}, status=400)

        from django.conf import settings

        if settings.DEBUG:
            # Dev: verify against our own OfficialOTP DB record
            otp = OfficialOTP.objects.filter(
                phone=phone, code=code, is_used=False
            ).order_by('-created_at').first()

            if not otp:
                return Response({'error': 'Invalid code. Please try again.'}, status=400)

            if timezone.now() > otp.expires_at:
                otp.is_used = True
                otp.save(update_fields=['is_used'])
                return Response({'error': 'Code has expired. Please request a new one.'}, status=400)

            otp.attempts += 1
            if otp.attempts > 5:
                otp.is_used = True
                otp.save(update_fields=['is_used', 'attempts'])
                return Response({'error': 'Too many attempts. Please request a new code.'}, status=400)

            otp.is_used = True
            otp.save(update_fields=['is_used', 'attempts'])
        else:
            # Production: verify via Arkesel OTP API
            try:
                from apps.notifications.tasks import arkesel_verify_otp
                verified = arkesel_verify_otp(phone, code)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f'Arkesel verify error for official {phone}: {e}')
                return Response({'error': 'Could not verify code. Please try again.'}, status=400)

            if not verified:
                return Response({'error': 'Invalid or expired code. Please try again.'}, status=400)

            # Mark any local OTP as used so we stay in sync
            OfficialOTP.objects.filter(phone=phone, is_used=False).update(is_used=True)

        official = Official.objects.filter(phone=phone, is_active=True).select_related(
            'event', 'ticket_event', 'user'
        ).first()
        if not official:
            return Response({'error': 'Official account not found.'}, status=404)

        # Auto-create or retrieve internal User for this official
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken
        User = get_user_model()

        safe_phone = phone.replace('+', '').replace(' ', '')
        email      = f'official_{safe_phone}@official.evoting.local'

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                'name':        official.name,
                'phone':       phone,
                'role':        'voter',   # base role — dashboard access controlled by official FK
                'is_verified': True,
            }
        )

        if official.user != user:
            official.user = user
            official.save(update_fields=['user'])

        refresh = RefreshToken.for_user(user)
        refresh['is_official']  = True
        refresh['official_id']  = str(official.id)
        refresh['official_name'] = official.name
        refresh['event_kind']   = official.event_kind
        refresh['event_id']     = str(official.event.id) if official.event else ''
        refresh['event_slug']   = official.event.slug if official.event else ''
        refresh['ticket_event_id'] = str(official.ticket_event.id) if official.ticket_event else ''

        return Response({
            'tokens': {
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            },
            'official': OfficialSerializer(official).data,
        })


# ── Official: Dashboard ───────────────────────────────────────────────────────

class OfficialDashboardView(APIView, IsOfficialPermission):
    """Returns all data needed for the official's dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        official = self._get_official(request)
        if not official:
            return Response({'error': 'Official account not found.'}, status=404)

        data = OfficialSerializer(official).data

        if official.event_kind == Official.EventKind.TICKETING and official.ticket_event:
            data['ticket_stats'] = self._ticket_stats(official)
            if float(official.revenue_percentage) > 0:
                data['ticket_revenue_stats'] = {
                    'my_percentage': float(official.revenue_percentage),
                    'my_earned':     official.total_earned,
                    'my_balance':    official.current_balance,
                    'my_withdrawn':  official.total_withdrawn,
                }

        elif official.event_kind == Official.EventKind.ELECTION and official.event:
            event = official.event
            if event.is_paid:
                data['revenue_stats'] = self._revenue_stats(official)
            if event.voting_mode == 'organizational':
                data['voter_roll_stats'] = self._voter_roll_stats(official)
            data['results'] = self._election_results(official)

        data['withdrawals'] = WithdrawalRequestSerializer(
            official.withdrawal_requests.all()[:20], many=True
        ).data

        return Response(data)

    def _ticket_stats(self, official):
        from apps.tickets.models import Ticket
        te = official.ticket_event
        tickets = Ticket.objects.filter(tier__event=te)
        return {
            'total':      tickets.filter(status__in=['paid', 'used', 'pending']).count(),
            'paid':       tickets.filter(status='paid').count(),
            'checked_in': tickets.filter(status='used').count(),
            'pending':    tickets.filter(status='pending').count(),
            'cancelled':  tickets.filter(status='cancelled').count(),
        }

    def _revenue_stats(self, official):
        from apps.payments.models import Payment
        payments = Payment.objects.filter(event=official.event)
        return {
            'total_votes':     official.event.total_votes,
            'total_revenue':   float(payments.filter(status='success').aggregate(
                t=__import__('django.db.models', fromlist=['Sum']).Sum('amount')
            )['t'] or 0),
            'pending_revenue': float(payments.filter(status='pending').aggregate(
                t=__import__('django.db.models', fromlist=['Sum']).Sum('amount')
            )['t'] or 0),
            'failed_payments': payments.filter(status='failed').count(),
            'my_percentage':   float(official.revenue_percentage),
            'my_earned':       official.total_earned,
            'my_balance':      official.current_balance,
            'my_withdrawn':    official.total_withdrawn,
        }

    def _voter_roll_stats(self, official):
        from apps.events.models import VoterRoll
        roll = VoterRoll.objects.filter(event=official.event)
        return {
            'total':    roll.count(),
            'voted':    roll.filter(status='used').count(),
            'not_voted': roll.filter(status='unused').count(),
        }

    def _election_results(self, official):
        from apps.events.models import Category, Candidate
        results = []
        for cat in official.event.categories.filter(is_active=True).prefetch_related('groups'):
            candidates = Candidate.objects.filter(
                category=cat, is_active=True
            ).order_by('-vote_count').values('id', 'name', 'vote_count', 'vote_percentage')
            group_ids   = [str(g.id)   for g in cat.groups.all()]
            group_names = [g.name      for g in cat.groups.all()]
            results.append({
                'category_id':   str(cat.id),
                'category_name': cat.name,
                'is_global':     cat.is_global,
                'group_ids':     group_ids,
                'group_names':   group_names,
                'candidates':    [
                    {**c, 'id': str(c['id'])} for c in candidates
                ],
            })
        return results


# ── Official: Ticket Check-in ─────────────────────────────────────────────────

class OfficialTicketListView(APIView, IsOfficialPermission):
    """List tickets for the official's event with optional search."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        official = self._get_official(request)
        if not official or official.event_kind != Official.EventKind.TICKETING:
            return Response({'error': 'Ticketing official access required.'}, status=403)

        from apps.tickets.models import Ticket
        from apps.tickets.serializers import TicketSerializer

        qs = Ticket.objects.filter(
            tier__event=official.ticket_event
        ).select_related('tier', 'buyer').order_by('-created_at')

        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(ticket_code__icontains=search) |
                Q(buyer_name__icontains=search) |
                Q(buyer_email__icontains=search) |
                Q(buyer_phone__icontains=search)
            )

        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response({
            'count':   qs.count(),
            'tickets': TicketSerializer(qs[:100], many=True).data,
        })


class OfficialCheckInView(APIView, IsOfficialPermission):
    """Check in a ticket holder by ticket code."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        official = self._get_official(request)
        if not official or official.event_kind != Official.EventKind.TICKETING:
            return Response({'error': 'Ticketing official access required.'}, status=403)

        ticket_code = request.data.get('ticket_code', '').strip().upper()
        if not ticket_code:
            return Response({'error': 'Ticket code is required.'}, status=400)

        from apps.tickets.models import Ticket
        try:
            ticket = Ticket.objects.select_related('tier__event').get(
                ticket_code=ticket_code,
                tier__event=official.ticket_event,
            )
        except Ticket.DoesNotExist:
            return Response({'error': 'Ticket not found for this event.'}, status=404)

        if ticket.status == 'used':
            return Response({
                'error':   'This ticket has already been checked in.',
                'ticket':  _ticket_summary(ticket),
                'already_used': True,
            }, status=400)

        if ticket.status != 'paid':
            return Response({
                'error':  f'Ticket cannot be checked in (status: {ticket.status}).',
                'ticket': _ticket_summary(ticket),
            }, status=400)

        ticket.status = 'used'
        ticket.save(update_fields=['status'])

        return Response({
            'success': True,
            'message': f'✅ {ticket.buyer_name} checked in successfully!',
            'ticket':  _ticket_summary(ticket),
        })


def _ticket_summary(ticket):
    return {
        'ticket_code': ticket.ticket_code,
        'buyer_name':  ticket.buyer_name,
        'buyer_email': ticket.buyer_email,
        'buyer_phone': ticket.buyer_phone,
        'tier_name':   ticket.tier.name,
        'quantity':    ticket.quantity,
        'status':      ticket.status,
        'paid_at':     ticket.paid_at,
    }


# ── Official: Voter Roll (Org Elections) ──────────────────────────────────────

class OfficialVoterRollView(APIView, IsOfficialPermission):
    """List voter roll for the official's org election event."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        official = self._get_official(request)
        if not official or official.event_kind != Official.EventKind.ELECTION:
            return Response({'error': 'Election official access required.'}, status=403)

        if official.event.voting_mode != 'organizational':
            return Response({'error': 'This event is not an organisational election.'}, status=400)

        from apps.events.models import VoterRoll, VoterGroup
        qs = VoterRoll.objects.filter(event=official.event).select_related('group')

        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(voter_id__icontains=search) |
                Q(name__icontains=search) |
                Q(phone__icontains=search) |
                Q(email__icontains=search)
            )

        group_id = request.query_params.get('group_id', '').strip()
        if group_id:
            qs = qs.filter(group_id=group_id)

        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        voters = qs.values(
            'id', 'voter_id', 'name', 'phone', 'email',
            'voting_code', 'status', 'sms_sent', 'used_at', 'created_at',
            'group__id', 'group__name',
        )

        groups = VoterGroup.objects.filter(event=official.event).values('id', 'name')

        return Response({
            'total':    qs.count(),
            'voted':    qs.filter(status='used').count(),
            'not_voted': qs.filter(status='unused').count(),
            'voters':   list(voters),
            'groups':   list(groups),
        })


class OfficialAddVoterView(APIView, IsOfficialPermission):
    """Add a single voter to the roll."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        official = self._get_official(request)
        if not official or official.event_kind != Official.EventKind.ELECTION:
            return Response({'error': 'Election official access required.'}, status=403)

        event = official.event
        voter_id = request.data.get('voter_id', '').strip()
        name     = request.data.get('name', '').strip()
        phone    = request.data.get('phone', '').strip()
        email    = request.data.get('email', '').strip()
        group_id = request.data.get('group_id', None)
        send_sms = request.data.get('send_sms', False)

        if not voter_id:
            return Response({'error': 'voter_id is required.'}, status=400)

        from apps.events.models import VoterRoll, VoterGroup
        if VoterRoll.objects.filter(event=event, voter_id=voter_id).exists():
            return Response({'error': f'Voter ID "{voter_id}" already exists for this event.'}, status=400)

        group = None
        if group_id:
            group = VoterGroup.objects.filter(id=group_id, event=event).first()

        voter = VoterRoll.objects.create(
            event=event, voter_id=voter_id,
            name=name, phone=phone, email=email, group=group
        )

        if send_sms and phone:
            try:
                from apps.notifications.tasks import send_sms as _send_sms
                _send_sms(phone, (
                    f'Hello {name or voter_id}, your voting code for '
                    f'{event.title} is: {voter.voting_code}. '
                    f'Use it on the voting page to cast your vote.'
                ))
                voter.sms_sent = True
                voter.save(update_fields=['sms_sent'])
            except Exception:
                pass

        return Response({
            'success': True,
            'voter': {
                'id': str(voter.id), 'voter_id': voter.voter_id,
                'name': voter.name, 'voting_code': voter.voting_code,
            }
        }, status=201)


class OfficialVoterRollCSVUploadView(APIView, IsOfficialPermission):
    """Upload a CSV of voters — delegates to the same task as admin."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        official = self._get_official(request)
        if not official or official.event_kind != Official.EventKind.ELECTION:
            return Response({'error': 'Election official access required.'}, status=403)

        event    = official.event
        csv_file = request.FILES.get('file')
        send_sms = request.data.get('send_sms', 'false').lower() == 'true'

        if not csv_file:
            return Response({'error': 'No file uploaded.'}, status=400)

        text = csv_file.read().decode('utf-8', errors='ignore')
        try:
            from apps.events.tasks import process_voter_roll_csv
            process_voter_roll_csv(str(event.id), text, send_sms)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response({'success': True, 'message': 'Voters uploaded successfully.'})


# ── Official: Withdrawals ─────────────────────────────────────────────────────

class OfficialWithdrawalView(APIView, IsOfficialPermission):
    """Official creates a withdrawal request."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        official = self._get_official(request)
        if not official:
            return Response({'error': 'Official not found.'}, status=404)
        qs = official.withdrawal_requests.all()
        return Response(WithdrawalRequestSerializer(qs, many=True).data)

    def post(self, request):
        official = self._get_official(request)
        if not official:
            return Response({'error': 'Official not found.'}, status=404)

        serializer = WithdrawalCreateSerializer(
            data=request.data, context={'official': official}
        )
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        wr = WithdrawalRequest.objects.create(
            official=official,
            amount=d['amount'],
            note=d.get('note', ''),
            payment_method=d.get('payment_method', ''),
            payment_account_name=d.get('payment_account_name', ''),
            payment_account_number=d.get('payment_account_number', ''),
        )

        # Notify all admin/superadmin users via SMS
        try:
            from apps.notifications.tasks import send_sms
            from apps.accounts.models import User as _User
            admin_users = _User.objects.filter(role__in=['admin', 'superadmin'], phone__isnull=False).exclude(phone='')
            for admin in admin_users:
                try:
                    send_sms(
                        admin.phone,
                        f'CelerVote: Official {official.name} has requested a withdrawal of GHS {d["amount"]:.2f}'
                        + (f' — {d.get("note", "")}' if d.get('note') else '')
                        + f'. Log in to review.'
                    )
                except Exception:
                    pass
        except Exception:
            pass

        return Response(WithdrawalRequestSerializer(wr).data, status=201)


# ── Admin: Manage Officials ───────────────────────────────────────────────────

class AdminOfficialListCreateView(APIView):
    """Admin lists all officials or creates one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)

        qs = Official.objects.select_related('event', 'ticket_event', 'user').all()

        event_slug = request.query_params.get('event_slug')
        if event_slug:
            qs = qs.filter(event__slug=event_slug)

        ticket_slug = request.query_params.get('ticket_slug')
        if ticket_slug:
            qs = qs.filter(ticket_event__slug=ticket_slug)

        return Response(OfficialSerializer(qs, many=True).data)

    def post(self, request):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)

        serializer = OfficialCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        official = serializer.save()
        return Response(OfficialSerializer(official).data, status=201)


class AdminOfficialDetailView(APIView):
    """Admin retrieves, updates or deletes a specific official."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)
        official = get_object_or_404(Official, pk=pk)
        return Response(OfficialSerializer(official).data)

    def patch(self, request, pk):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)
        official = get_object_or_404(Official, pk=pk)
        serializer = OfficialCreateSerializer(official, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OfficialSerializer(official).data)

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)
        official = get_object_or_404(Official, pk=pk)
        official.delete()
        return Response(status=204)


# ── Admin: Withdrawal Management ─────────────────────────────────────────────

class AdminWithdrawalListView(APIView):
    """Admin views all withdrawal requests (pending first, then history)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)

        qs = WithdrawalRequest.objects.select_related(
            'official__event', 'official__ticket_event', 'reviewed_by'
        ).all()

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        event_slug = request.query_params.get('event_slug')
        if event_slug:
            qs = qs.filter(official__event__slug=event_slug)

        return Response(WithdrawalRequestSerializer(qs, many=True).data)


class AdminWithdrawalReviewView(APIView):
    """Admin approves or declines a withdrawal request."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _is_admin(request.user):
            return Response({'error': 'Admin access required.'}, status=403)

        wr = get_object_or_404(WithdrawalRequest, pk=pk)
        if wr.status != WithdrawalRequest.Status.PENDING:
            return Response({'error': 'This request has already been reviewed.'}, status=400)

        action = request.data.get('action', '').lower()
        if action not in ('approve', 'decline'):
            return Response({'error': 'action must be "approve" or "decline".'}, status=400)

        if action == 'approve':
            # Guard: ensure official still has enough balance
            if float(wr.amount) > wr.official.current_balance:
                return Response({
                    'error': (
                        f'Cannot approve — official balance ({wr.official.current_balance}) '
                        f'is less than requested amount ({wr.amount}).'
                    )
                }, status=400)
            wr.status = WithdrawalRequest.Status.APPROVED
        else:
            wr.status = WithdrawalRequest.Status.DECLINED

        wr.admin_note  = request.data.get('admin_note', '')
        wr.reviewed_by = request.user
        wr.reviewed_at = timezone.now()
        wr.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

        # Notify the official via SMS
        try:
            from apps.notifications.tasks import send_sms
            official_phone = wr.official.phone
            if official_phone:
                if action == 'approve':
                    msg = (
                        f'CelerVote: Your withdrawal request of GHS {wr.amount} has been APPROVED. '
                        f'Funds will be disbursed shortly.'
                    )
                else:
                    msg = (
                        f'CelerVote: Your withdrawal request of GHS {wr.amount} has been DECLINED.'
                        + (f' Reason: {wr.admin_note}' if wr.admin_note else '')
                    )
                send_sms(official_phone, msg)
        except Exception:
            pass

        return Response(WithdrawalRequestSerializer(wr).data)
