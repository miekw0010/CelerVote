from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from django.shortcuts import get_object_or_404
from apps.events.models import Event
from .models import Vote, VoteSession, FraudFlag
from .services import VoteCaster, get_live_results
from .serializers import CastVoteSerializer, BulkCastVoteSerializer, VoterActivitySerializer, FraudFlagSerializer
import asyncio

def broadcast_results(event):
    """Push updated results to all WebSocket clients watching this event."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        results    = get_live_results(str(event.id))
        group_name = f'results_{event.slug}'
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'vote_update',
                'data': results,
            }
        )
    except Exception as e:
        print(f"[WebSocket] Broadcast error: {e}")

class CheckEligibilityView(APIView):
    """Check if a voter is eligible to vote in a category before payment."""
    permission_classes = [AllowAny]

    def post(self, request):
        from apps.events.models import Event, Category
        slug        = request.data.get('event_slug')
        category_id = request.data.get('category_id')

        try:
            event    = Event.objects.get(slug=slug)
            category = Category.objects.get(id=category_id)
        except Exception:
            return Response({'eligible': False, 'reason': 'Event or category not found.'}, status=404)

        # Paid events allow multiple votes — that's the business model
        # Only restrict on free events
        if not event.is_paid and not event.allow_multiple_votes:
            voter = request.user if request.user.is_authenticated else None
            if voter:
                from apps.voting.models import Vote, VoteSession
                session = VoteSession.objects.filter(event=event, voter=voter).first()
                if session and Vote.objects.filter(session=session, category=category).exists():
                    return Response({
                        'eligible': False,
                        'reason':   'You have already voted in this category.'
                    })

        return Response({'eligible': True})

class VoteCastThrottle(AnonRateThrottle):
    """
    30 votes per minute per IP for unauthenticated (free/org) voters.
    Authenticated users get a higher ceiling via UserRateThrottle.
    This fires BEFORE the vote is written — fraud detection is a second layer.
    """
    scope = 'vote_cast'


class CastVoteView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [VoteCastThrottle, UserRateThrottle]

    def post(self, request):
        serializer = CastVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data  = serializer.validated_data
        event = get_object_or_404(Event, slug=data['event_slug'])

        # Paid events: allow unauthenticated voters — payment reference proves identity.
        # The VoteCaster verifies the payment before casting any vote,
        # so there is no way to vote without a real successful payment.
        # Free events with require_auth still enforce login.
        if event.require_auth and not event.is_paid and not request.user.is_authenticated:
            return Response({'error': 'You must be logged in to vote.'}, status=status.HTTP_401_UNAUTHORIZED)

        voter = request.user if request.user.is_authenticated else None

        # Extract voter_group from JWT for organizational elections
        # Use SimpleJWT's verified token — never decode without signature verification
        voter_group    = None
        voter_roll_entry = None
        try:
            from rest_framework_simplejwt.tokens import AccessToken as _AccessToken
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token_str = auth_header.split(' ')[1]
                verified  = _AccessToken(token_str)  # raises if invalid/expired
                group_id  = verified.get('group_id')
                roll_id   = verified.get('voter_roll_id')
                if group_id:
                    from apps.events.models import VoterGroup
                    voter_group = VoterGroup.objects.filter(id=group_id).first()
                if roll_id:
                    from apps.events.models import VoterRoll
                    voter_roll_entry = VoterRoll.objects.filter(id=roll_id).first()
        except Exception:
            pass

        # ── Org election JWT revocation check ────────────────────────────────
        # Runs BEFORE VoteCaster so a shared/replayed token is blocked here,
        # not discovered after the vote is written.
        # A voter's code is marked 'used' only after ALL categories are voted —
        # so we check the DB status directly, not the token claim.
        if voter_roll_entry is not None and voter_roll_entry.status == 'used':
            return Response(
                {'error': 'This voting code has already been used. Each code can only vote once.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # For unauthenticated paid voters, derive a guest identity from the payment email
        if not voter and event.is_paid and data.get('payment_ref'):
            from apps.payments.models import Payment as PaymentModel
            try:
                payment = PaymentModel.objects.get(reference=data['payment_ref'])
                email   = payment.email or ''
                phone   = payment.phone or ''
                if email:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    voter, _ = User.objects.get_or_create(
                        email=email,
                        defaults={
                            'name':        phone or email.split('@')[0],
                            'phone':       phone or None,
                            'is_verified': True,
                        }
                    )
            except PaymentModel.DoesNotExist:
                pass

        caster = VoteCaster(event, voter, request, voter_group=voter_group)
        result = caster.cast_vote(
            category_id=data['category_id'],
            candidate_ids=data['candidate_ids'],
            payment_ref=data.get('payment_ref', ''),
            quantity=data.get('quantity', 1),
        )

        if not result['success']:
            import logging
            logging.getLogger(__name__).error(f"cast_vote FAILED: {result.get('error')} | ref={data.get('payment_ref')} | event={data.get('event_slug')} | cat={data.get('category_id')}")

        if result['success']:
            # ── Mark voter roll entry as used ──
            voter_roll_id = None
            try:
                from rest_framework_simplejwt.tokens import AccessToken as _AccessToken
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    verified      = _AccessToken(auth_header.split(' ')[1])
                    voter_roll_id = verified.get('voter_roll_id')
            except Exception:
                pass

            if voter_roll_entry:
                try:
                    from django.utils import timezone as _tz
                    from apps.voting.models import Vote as _Vote
                    from apps.events.models import VoterGroup as _VoterGroup, Category as _Category

                    # Determine the voter's ballot — same logic as verify-code endpoint:
                    # global categories + categories belonging to their group.
                    has_groups = event.voter_groups.exists()
                    all_cats   = list(event.categories.filter(is_active=True))

                    if not has_groups:
                        ballot_cats = all_cats
                    else:
                        ballot_cats = [
                            c for c in all_cats
                            if c.is_global or (
                                voter_roll_entry.group and
                                c.groups.filter(id=voter_roll_entry.group_id).exists()
                            )
                        ]

                    ballot_cat_ids = {c.id for c in ballot_cats}

                    # Count how many ballot categories this voter has cast in this session
                    voted_cat_ids = set(
                        _Vote.objects
                        .filter(session__voter=voter, event=event)
                        .values_list('category_id', flat=True)
                        .distinct()
                    ) if voter else set()

                    # Also check votes from this specific session (covers guest/org voters
                    # where voter account is auto-created and may differ per session)
                    if not voted_cat_ids:
                        # Fallback: check by voter_roll entry directly via session join
                        from apps.voting.models import VoteSession as _VS
                        sessions = _VS.objects.filter(event=event, voter=voter)
                        voted_cat_ids = set(
                            _Vote.objects
                            .filter(session__in=sessions, event=event)
                            .values_list('category_id', flat=True)
                            .distinct()
                        )

                    # Only mark as used once all ballot categories have been voted in
                    if ballot_cat_ids and ballot_cat_ids.issubset(voted_cat_ids):
                        voter_roll_entry.status  = 'used'
                        voter_roll_entry.used_at = _tz.now()
                        voter_roll_entry.save(update_fields=['status', 'used_at'])
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f'Could not check voter roll completion: {e}')

            # ── Broadcast live results to WebSocket clients ──
            broadcast_results(event)
            return Response(result, status=status.HTTP_201_CREATED)

        return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)


class BulkCastVoteView(APIView):
    """
    Org elections only — submit all category selections in one atomic request.
    The voter selects candidates across all their visible categories, reviews
    a summary, then confirms once. This view processes the entire ballot.
    """
    permission_classes = [AllowAny]
    throttle_classes   = [VoteCastThrottle, UserRateThrottle]

    def post(self, request):
        serializer = BulkCastVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data  = serializer.validated_data
        event = get_object_or_404(Event, slug=data['event_slug'])

        if event.voting_mode != 'organizational':
            return Response(
                {'error': 'Bulk voting is only available for organisational elections.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not event.is_open:
            return Response(
                {'error': 'Voting is not currently open for this event.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not request.user.is_authenticated:
            return Response(
                {'error': 'You must verify your voting code before casting votes.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Extract voter_group from JWT — always use verified decode
        voter_group = None
        voter_roll_entry = None
        try:
            from rest_framework_simplejwt.tokens import AccessToken as _AccessToken
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                verified = _AccessToken(auth_header.split(' ')[1])
                group_id = verified.get('group_id')
                roll_id  = verified.get('voter_roll_id')
                if group_id:
                    from apps.events.models import VoterGroup
                    voter_group = VoterGroup.objects.filter(id=group_id).first()
                if roll_id:
                    from apps.events.models import VoterRoll
                    voter_roll_entry = VoterRoll.objects.filter(id=roll_id).first()
        except Exception:
            pass

        # Guard: voter roll already used
        if voter_roll_entry and voter_roll_entry.status == 'used':
            return Response(
                {'error': 'This voting code has already been used.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        vote_items = [
            {'category_id': str(item['category_id']), 'candidate_id': str(item['candidate_id'])}
            for item in data['votes']
        ]

        caster = VoteCaster(
            event=event,
            voter=request.user,
            request=request,
            voter_group=voter_group,
        )
        result = caster.bulk_cast_votes(vote_items)

        if result['success']:
            # Mark voter roll as used after successful bulk cast
            if voter_roll_entry and voter_roll_entry.status == 'unused':
                from django.utils import timezone as tz
                voter_roll_entry.status = 'used'
                voter_roll_entry.used_at = tz.now()
                voter_roll_entry.save(update_fields=['status', 'used_at'])

            broadcast_results(event)
            return Response(result, status=status.HTTP_201_CREATED)

        return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)


class LiveResultsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        event   = get_object_or_404(Event, slug=slug)
        results = get_live_results(str(event.id))
        return Response(results)

class VoterActivityView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = VoterActivitySerializer

    def get_queryset(self):
        event = get_object_or_404(Event, slug=self.kwargs['slug'])
        if event.organizer != self.request.user and self.request.user.role != 'superadmin':
            return VoteSession.objects.none()
        return VoteSession.objects.filter(event=event).select_related('voter').order_by('-created_at')


class FraudFlagsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = FraudFlagSerializer

    def get_queryset(self):
        event = get_object_or_404(Event, slug=self.kwargs['slug'])
        if event.organizer != self.request.user and self.request.user.role != 'superadmin':
            return FraudFlag.objects.none()
        return FraudFlag.objects.filter(event=event).order_by('-created_at')


class FraudFlagResolutionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, flag_id):
        flag  = get_object_or_404(FraudFlag, id=flag_id)
        event = flag.event
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)
        resolution = request.data.get('resolution')
        if resolution not in [r[0] for r in FraudFlag.Resolution.choices]:
            return Response({'error': 'Invalid resolution'}, status=400)
        flag.resolution  = resolution
        flag.resolved_by = request.user
        flag.save(update_fields=['resolution', 'resolved_by'])

        from .services import log_admin_action
        log_admin_action(
            admin_user=request.user,
            action='fraud_resolved',
            description=f'Fraud flag {flag_id} marked as "{resolution}" by {request.user.email}',
            event=event,
            metadata={'flag_id': str(flag_id), 'resolution': resolution},
            ip=request.META.get('REMOTE_ADDR'),
        )
        return Response({'message': f'Flag marked as {resolution}'})

class ResetVotesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        from apps.events.models import Candidate
        from django.core.cache import cache

        Vote.objects.filter(event=event).delete()
        VoteSession.objects.filter(event=event).delete()
        Candidate.objects.filter(category__event=event).update(vote_count=0, vote_percentage=0.0)
        event.total_votes = 0
        event.save(update_fields=['total_votes'])
        # Only clear this event's results cache — NOT the entire Redis cache
        # Clearing all would wipe rate-limit counters and active IP ban records
        cache.delete(f'live_results:{event.id}')

        from .services import log_admin_action
        from apps.voting.services import get_client_ip
        log_admin_action(
            admin_user=request.user,
            action='vote_reset',
            description=f'All votes reset for "{event.title}" by {request.user.email}',
            event=event,
            metadata={'total_votes_deleted': event.total_votes},
            ip=request.META.get('REMOTE_ADDR'),
        )
        return Response({'message': f'All votes reset for {event.title}'})


class RecoverVoteView(APIView):
    """Admin tool: verify a payment reference and manually cast missing votes.

    FIX: previously hardcoded a call to Paystack's verify API for EVERY
    reference, regardless of which provider actually processed the payment.
    Since the project migrated to Nalo for web checkout (refs still use the
    EVOTE- prefix) and USSD payments use Nalo collections, Paystack has zero
    record of these and always returned status=false/amount=0 — showing
    "Payment not successful" / "Amount paid 0.00" for transactions that had
    genuinely succeeded and already had votes cast via the webhook.

    Fix: check our own Payment record FIRST (status is already correct,
    set by whichever webhook actually processed the payment — Nalo checkout
    or Nalo USSD collections). This is now the single source of truth.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.events.models import Event, Category, Candidate
        from apps.payments.models import Payment as PaymentModel

        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=403)

        reference    = request.data.get('reference', '').strip()
        event_slug   = request.data.get('event_slug', '').strip()
        category_id  = request.data.get('category_id', '').strip()
        candidate_id = request.data.get('candidate_id', '').strip()

        if not all([reference, event_slug, category_id, candidate_id]):
            return Response({'error': 'reference, event_slug, category_id and candidate_id are all required.'}, status=400)

        # Already recovered?
        if Vote.objects.filter(payment_ref=reference).exists():
            votes = Vote.objects.filter(payment_ref=reference)
            return Response({
                'status':  'already_cast',
                'message': f'{votes.count()} vote(s) already exist for this reference.',
            })

        # ── Check OUR OWN Payment record first — this is the source of truth ──
        # set correctly by whichever webhook (Nalo checkout or Nalo USSD)
        # actually processed the transaction.
        try:
            payment_record = PaymentModel.objects.get(reference=reference)
        except PaymentModel.DoesNotExist:
            return Response({'error': f'No payment record found for reference {reference}.'}, status=404)

        voter_email = payment_record.email or ''
        quantity    = payment_record.votes_bought or 1

        if payment_record.status != PaymentModel.Status.SUCCESS:
            return Response({
                'error': f'Payment status is "{payment_record.status}" — not yet confirmed successful. Cannot recover.'
            }, status=400)

        try:
            event     = Event.objects.get(slug=event_slug)
            category  = Category.objects.get(id=category_id, event=event)
            candidate = Candidate.objects.get(id=candidate_id, category=category)
        except Exception as e:
            return Response({'error': f'Invalid event/category/candidate: {str(e)}'}, status=400)

        # Get or create a User account for the voter so cast_vote() can attach it
        from django.contrib.auth import get_user_model
        User   = get_user_model()
        voter  = User.objects.filter(email=voter_email).first() if voter_email else None

        # Route through VoteCaster.cast_vote() — shares the same locking,
        # idempotency, and fraud-bypass-for-paid-votes logic as every other
        # vote-write path (webhook, USSD callback, frontend castVote).
        caster = VoteCaster(event=event, voter=voter, request=None, ip='0.0.0.0')
        result = caster.cast_vote(
            category_id=str(category.id),
            candidate_ids=[str(candidate.id)],
            payment_ref=reference,
            quantity=quantity,
        )

        if not result.get('success'):
            return Response({'error': result.get('error', 'Recovery failed.')}, status=400)

        from django.core.cache import cache
        cache.delete(f'live_results:{event.id}')

        from .services import log_admin_action
        log_admin_action(
            admin_user=request.user,
            action='manual_recovery',
            description=f'Manual vote recovery: {quantity} vote(s) for "{candidate.name}" using ref {reference}',
            event=event,
            metadata={'reference': reference, 'quantity': quantity, 'candidate': candidate.name, 'voter': voter_email},
            ip=request.META.get('REMOTE_ADDR'),
        )

        return Response({
            'status':    'recovered',
            'message':   f'Successfully cast {quantity} vote(s) for {candidate.name}.',
            'quantity':  quantity,
            'candidate': candidate.name,
            'category':  category.name,
            'voter':     voter_email,
        })


class CheckReferenceView(APIView):
    """Admin tool: check a payment reference — was it paid? were votes cast?

    FIX: previously hardcoded a call to Paystack's verify API for every
    reference. Now checks our own Payment record first (correct regardless
    of provider — Paystack, Nalo checkout, or Nalo USSD), and only attempts
    a live Paystack lookup as a secondary check for genuinely Paystack-era
    references that predate the Nalo migration.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        import requests as _requests
        from apps.payments.models import Payment as PaymentModel

        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=403)

        reference = request.query_params.get('reference', '').strip()
        if not reference:
            return Response({'error': 'reference is required.'}, status=400)

        votes_cast = Vote.objects.filter(payment_ref=reference).count()

        # ── Check our own Payment record first — correct for every provider ──
        try:
            pm = PaymentModel.objects.get(reference=reference)
            saved_category_id  = str(pm.category_id)  if pm.category_id  else None
            saved_candidate_id = str(pm.candidate_id) if pm.candidate_id else None

            return Response({
                'reference':           reference,
                'payment_status':      pm.status,
                'paystack_status':     'success' if pm.status == 'success' else pm.status,
                'amount_paid':         float(pm.amount),
                'currency':            pm.currency,
                'voter_email':         pm.email,
                'voter_phone':         pm.phone,
                'paid_at':             pm.updated_at.isoformat() if hasattr(pm, 'updated_at') else None,
                'votes_cast':          votes_cast,
                'needs_recovery':      pm.status == PaymentModel.Status.SUCCESS and votes_cast == 0,
                'saved_category_id':   saved_category_id,
                'saved_candidate_id':  saved_candidate_id,
                'provider':            'nalo' if str(pm.reference).startswith(('EVOTE-', 'USSD-')) else 'unknown',
            })
        except PaymentModel.DoesNotExist:
            pass

        # ── Fall back to Paystack only if no local Payment record exists ──
        # (legacy references from before the Nalo migration)
        try:
            resp = _requests.get(
                f'https://api.paystack.co/transaction/verify/{reference}',
                headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'},
                timeout=10,
            )
            txn_data = resp.json().get('data', {})
        except Exception as e:
            return Response({'error': f'No local Payment record found, and Paystack API error: {str(e)}'}, status=502)

        if not txn_data:
            return Response({'error': f'No payment record found for reference {reference} (checked local DB and Paystack).'}, status=404)

        return Response({
            'reference':         reference,
            'paystack_status':   txn_data.get('status'),
            'amount_paid':       txn_data.get('amount', 0) / 100,
            'currency':          txn_data.get('currency'),
            'voter_email':       txn_data.get('customer', {}).get('email'),
            'paid_at':           txn_data.get('paid_at'),
            'votes_cast':        votes_cast,
            'needs_recovery':    txn_data.get('status') == 'success' and votes_cast == 0,
            'provider':          'paystack',
        })


class ExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=403)
        # TODO: implement CSV/PDF export of results for event `slug`
        from django.http import HttpResponse
        return HttpResponse(f"Export stub for {slug} — implement me.", content_type="text/plain")
    
class AdminAuditLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=403)

        from .models import AdminAuditLog
        slug = request.query_params.get('event')
        logs = AdminAuditLog.objects.select_related('admin', 'event').order_by('-created_at')[:100]

        if slug:
            from apps.events.models import Event
            try:
                event = Event.objects.get(slug=slug)
                logs = logs.filter(event=event)
            except Event.DoesNotExist:
                pass

        data = [{
            'id':          str(log.id),
            'admin':       log.admin.email if log.admin else 'system',
            'action':      log.action,
            'description': log.description,
            'event':       log.event.title if log.event else None,
            'metadata':    log.metadata,
            'ip_address':  log.ip_address,
            'created_at':  log.created_at,
        } for log in logs]

        return Response({'count': len(data), 'results': data})