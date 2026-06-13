from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import F
from django.core.cache import cache
from django.utils import timezone
from django.conf import settings
from apps.events.models import Event
from .models import Vote, VoteSession, FraudFlag, AdminAuditLog
from .services import VoteCaster, get_live_results, log_admin_action, get_client_ip
from .serializers import CastVoteSerializer, BulkCastVoteSerializer, VoterActivitySerializer, FraudFlagSerializer
import logging
import hashlib
import json
import requests as _requests
from datetime import timedelta

logger = logging.getLogger(__name__)

# ============================================
# HELPER FUNCTIONS
# ============================================

def broadcast_results(event):
    """Push updated results to all WebSocket clients watching this event."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        results = get_live_results(str(event.id))
        group_name = f'results_{event.slug}'
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'vote_update',
                'data': results,
            }
        )
    except Exception as e:
        logger.error(f"WebSocket broadcast failed for event {event.slug}: {e}", exc_info=True)


def check_vote_cooldown(ip_address: str, cooldown_seconds: int = 5) -> bool:
    """Check if IP is in vote cooldown period."""
    cache_key = f'vote_cooldown_{ip_address}'
    if cache.get(cache_key):
        return False
    cache.set(cache_key, True, timeout=cooldown_seconds)
    return True


def generate_vote_integrity_hash(vote_data: dict) -> str:
    """Generate integrity hash for vote data."""
    import hashlib
    import json
    
    # Sort keys to ensure consistent hash
    sorted_data = json.dumps(vote_data, sort_keys=True, default=str)
    return hashlib.sha256(sorted_data.encode()).hexdigest()


# ============================================
# THROTTLE CLASSES
# ============================================

class VoteCastThrottle(AnonRateThrottle):
    """
    30 votes per minute per IP for unauthenticated (free/org) voters.
    Authenticated users get a higher ceiling via UserRateThrottle.
    This fires BEFORE the vote is written — fraud detection is a second layer.
    """
    scope = 'vote_cast'


class VoteCooldownThrottle(UserRateThrottle):
    """Additional cooldown between votes from same IP."""
    scope = 'vote_cooldown'
    
    def allow_request(self, request, view):
        ip_address = get_client_ip(request)
        return check_vote_cooldown(ip_address, cooldown_seconds=5)


# ============================================
# CHECK ELIGIBILITY VIEW
# ============================================

class CheckEligibilityView(APIView):
    """Check if a voter is eligible to vote in a category before payment."""
    permission_classes = [AllowAny]

    def post(self, request):
        from apps.events.models import Event, Category
        slug = request.data.get('event_slug')
        category_id = request.data.get('category_id')

        try:
            event = Event.objects.get(slug=slug)
            category = Category.objects.get(id=category_id, event=event)
        except Exception:
            # Generic error to prevent information leakage
            return Response({'eligible': False, 'reason': 'Cannot determine eligibility'}, status=404)

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
                        'reason': 'You have already voted in this category.'
                    })

        return Response({'eligible': True})


# ============================================
# CAST VOTE VIEW (FIXED)
# ============================================

class CastVoteView(APIView):
    """
    Secure vote casting with:
    - Atomic transactions
    - Race condition protection
    - Vote cooldown
    - Integrity hashing
    - Payment reference uniqueness
    """
    permission_classes = [AllowAny]
    throttle_classes = [VoteCastThrottle, UserRateThrottle, VoteCooldownThrottle]

    def post(self, request):
        serializer = CastVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        event = get_object_or_404(Event, slug=data['event_slug'])

        # Check cooldown
        ip_address = get_client_ip(request)
        if not check_vote_cooldown(ip_address, cooldown_seconds=5):
            return Response(
                {'error': 'Please wait a few seconds before casting another vote.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        # Authentication check for free events
        if event.require_auth and not event.is_paid and not request.user.is_authenticated:
            return Response(
                {'error': 'You must be logged in to vote.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        voter = request.user if request.user.is_authenticated else None

        # Extract voter_group and voter_roll from JWT
        voter_group = None
        voter_roll_entry = None
        try:
            from rest_framework_simplejwt.tokens import AccessToken as _AccessToken
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token_str = auth_header.split(' ')[1]
                verified = _AccessToken(token_str)
                group_id = verified.get('group_id')
                roll_id = verified.get('voter_roll_id')
                if group_id:
                    from apps.events.models import VoterGroup
                    voter_group = VoterGroup.objects.filter(id=group_id).first()
                if roll_id:
                    from apps.events.models import VoterRoll
                    voter_roll_entry = VoterRoll.objects.filter(id=roll_id).first()
        except Exception:
            pass

        # Check if voter roll entry is already used (with lock to prevent race)
        if voter_roll_entry:
            with transaction.atomic():
                # Lock the row to prevent race conditions
                locked_roll = VoterRoll.objects.select_for_update().filter(id=voter_roll_entry.id).first()
                if locked_roll and locked_roll.status == 'used':
                    return Response(
                        {'error': 'This voting code has already been used. Each code can only vote once.'},
                        status=status.HTTP_403_FORBIDDEN
                    )

        # For unauthenticated paid voters, derive a guest identity from payment email
        if not voter and event.is_paid and data.get('payment_ref'):
            from apps.payments.models import Payment as PaymentModel
            try:
                payment = PaymentModel.objects.get(reference=data['payment_ref'])
                email = payment.email or ''
                phone = payment.phone or ''
                if email:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    voter, _ = User.objects.get_or_create(
                        email=email,
                        defaults={
                            'name': phone or email.split('@')[0],
                            'phone': phone or None,
                            'is_verified': True,
                        }
                    )
            except PaymentModel.DoesNotExist:
                pass

        # Cast vote using VoteCaster with atomic transaction
        caster = VoteCaster(event, voter, request, voter_group=voter_group)
        
        # Use atomic transaction for the entire vote casting process
        try:
            with transaction.atomic():
                # Check for duplicate payment reference (prevents race condition)
                payment_ref = data.get('payment_ref', '')
                if payment_ref:
                    # Lock the payment reference check
                    existing_vote = Vote.objects.select_for_update().filter(payment_ref=payment_ref).first()
                    if existing_vote:
                        return Response(
                            {'error': 'This payment has already been used to cast votes.'},
                            status=status.HTTP_409_CONFLICT
                        )
                
                result = caster.cast_vote(
                    category_id=data['category_id'],
                    candidate_ids=data['candidate_ids'],
                    payment_ref=payment_ref,
                    quantity=data.get('quantity', 1),
                )
                
                if result['success']:
                    # Mark voter roll entry as used (with lock)
                    if voter_roll_entry:
                        try:
                            # Re-lock and re-check within transaction
                            locked_roll = VoterRoll.objects.select_for_update().get(id=voter_roll_entry.id)
                            
                            # Determine ballot categories
                            has_groups = event.voter_groups.exists()
                            all_cats = list(event.categories.filter(is_active=True))
                            
                            if not has_groups:
                                ballot_cats = all_cats
                            else:
                                ballot_cats = [
                                    c for c in all_cats
                                    if c.is_global or (
                                        locked_roll.group and
                                        c.groups.filter(id=locked_roll.group_id).exists()
                                    )
                                ]
                            
                            ballot_cat_ids = {c.id for c in ballot_cats}
                            
                            # Count voted categories
                            voted_cat_ids = set(
                                Vote.objects
                                .filter(session__voter=voter, event=event)
                                .values_list('category_id', flat=True)
                                .distinct()
                            ) if voter else set()
                            
                            if not voted_cat_ids:
                                from apps.voting.models import VoteSession as _VS
                                sessions = _VS.objects.filter(event=event, voter=voter)
                                voted_cat_ids = set(
                                    Vote.objects
                                    .filter(session__in=sessions, event=event)
                                    .values_list('category_id', flat=True)
                                    .distinct()
                                )
                            
                            # Only mark as used once all categories are voted
                            if ballot_cat_ids and ballot_cat_ids.issubset(voted_cat_ids):
                                if locked_roll.status != 'used':
                                    locked_roll.status = 'used'
                                    locked_roll.used_at = timezone.now()
                                    locked_roll.save(update_fields=['status', 'used_at'])
                        except Exception as e:
                            logger.warning(f'Could not check voter roll completion: {e}')
                    
                    # Broadcast live results
                    broadcast_results(event)
                    
                    # Log successful vote
                    logger.info(f"Vote cast successfully for event {event.slug} from IP {ip_address}")
                    
                    return Response(result, status=status.HTTP_201_CREATED)
                
                return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            logger.error(f"Vote casting failed: {e}", exc_info=True)
            return Response(
                {'error': 'An internal error occurred while processing your vote.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================
# BULK CAST VOTE VIEW (FIXED)
# ============================================

class BulkCastVoteView(APIView):
    """
    Org elections only — submit all category selections in one atomic request.
    The voter selects candidates across all their visible categories, reviews
    a summary, then confirms once. This view processes the entire ballot.
    """
    permission_classes = [AllowAny]
    throttle_classes = [VoteCastThrottle, UserRateThrottle, VoteCooldownThrottle]

    def post(self, request):
        serializer = BulkCastVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        event = get_object_or_404(Event, slug=data['event_slug'])
        
        # Check cooldown
        ip_address = get_client_ip(request)
        if not check_vote_cooldown(ip_address, cooldown_seconds=5):
            return Response(
                {'error': 'Please wait a few seconds before casting votes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

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

        # Extract voter_group from JWT
        voter_group = None
        voter_roll_entry = None
        try:
            from rest_framework_simplejwt.tokens import AccessToken as _AccessToken
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                verified = _AccessToken(auth_header.split(' ')[1])
                group_id = verified.get('group_id')
                roll_id = verified.get('voter_roll_id')
                if group_id:
                    from apps.events.models import VoterGroup
                    voter_group = VoterGroup.objects.filter(id=group_id).first()
                if roll_id:
                    from apps.events.models import VoterRoll
                    voter_roll_entry = VoterRoll.objects.filter(id=roll_id).first()
        except Exception:
            pass

        # Guard: voter roll already used (with lock)
        if voter_roll_entry:
            with transaction.atomic():
                locked_roll = VoterRoll.objects.select_for_update().filter(id=voter_roll_entry.id).first()
                if locked_roll and locked_roll.status == 'used':
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
        
        try:
            with transaction.atomic():
                result = caster.bulk_cast_votes(vote_items)

                if result['success']:
                    # Mark voter roll as used after successful bulk cast
                    if voter_roll_entry:
                        locked_roll = VoterRoll.objects.select_for_update().get(id=voter_roll_entry.id)
                        if locked_roll.status == 'unused':
                            locked_roll.status = 'used'
                            locked_roll.used_at = timezone.now()
                            locked_roll.save(update_fields=['status', 'used_at'])

                    broadcast_results(event)
                    logger.info(f"Bulk vote cast successfully for event {event.slug} by {request.user.email}")
                    return Response(result, status=status.HTTP_201_CREATED)

                return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            logger.error(f"Bulk vote casting failed: {e}", exc_info=True)
            return Response(
                {'error': 'An internal error occurred while processing your votes.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================
# LIVE RESULTS VIEW
# ============================================

class LiveResultsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        results = get_live_results(str(event.id))
        return Response(results)


# ============================================
# VOTER ACTIVITY VIEW
# ============================================

class VoterActivityView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = VoterActivitySerializer

    def get_queryset(self):
        event = get_object_or_404(Event, slug=self.kwargs['slug'])
        if event.organizer != self.request.user and self.request.user.role != 'superadmin':
            return VoteSession.objects.none()
        return VoteSession.objects.filter(event=event).select_related('voter').order_by('-created_at')


# ============================================
# FRAUD FLAGS VIEW
# ============================================

class FraudFlagsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FraudFlagSerializer

    def get_queryset(self):
        event = get_object_or_404(Event, slug=self.kwargs['slug'])
        if event.organizer != self.request.user and self.request.user.role != 'superadmin':
            return FraudFlag.objects.none()
        return FraudFlag.objects.filter(event=event).order_by('-created_at')


# ============================================
# FRAUD FLAG RESOLUTION VIEW (FIXED)
# ============================================

class FraudFlagResolutionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, flag_id):
        flag = get_object_or_404(FraudFlag, id=flag_id)
        event = flag.event
        
        # Stricter permission check
        if request.user.role == 'admin':
            if not Event.objects.filter(organizer=request.user, fraud_flags__id=flag_id).exists():
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        elif request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        resolution = request.data.get('resolution')
        if resolution not in [r[0] for r in FraudFlag.Resolution.choices]:
            return Response({'error': 'Invalid resolution'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            flag.resolution = resolution
            flag.resolved_by = request.user
            flag.save(update_fields=['resolution', 'resolved_by'])

            log_admin_action(
                admin_user=request.user,
                action='fraud_resolved',
                description=f'Fraud flag {flag_id} marked as "{resolution}" by {request.user.email}',
                event=event,
                metadata={'flag_id': str(flag_id), 'resolution': resolution},
                ip=request.META.get('REMOTE_ADDR'),
            )
        
        return Response({'message': f'Flag marked as {resolution}'})


# ============================================
# RESET VOTES VIEW (FIXED WITH LOCKS)
# ============================================

class ResetVotesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            with transaction.atomic():
                from apps.events.models import Candidate
                
                # Lock the event row to prevent concurrent modifications
                locked_event = Event.objects.select_for_update().get(id=event.id)
                
                # Delete votes (will cascade due to FK)
                deleted_votes, _ = Vote.objects.filter(event=locked_event).delete()
                deleted_sessions, _ = VoteSession.objects.filter(event=locked_event).delete()
                
                # Reset candidate vote counts
                Candidate.objects.filter(category__event=locked_event).update(vote_count=0, vote_percentage=0.0)
                
                # Reset event totals
                locked_event.total_votes = 0
                locked_event.save(update_fields=['total_votes'])
                
                # Clear cache
                cache.delete(f'live_results:{locked_event.id}')
                
                # Log the action
                log_admin_action(
                    admin_user=request.user,
                    action='vote_reset',
                    description=f'All votes reset for "{locked_event.title}" by {request.user.email}',
                    event=locked_event,
                    metadata={
                        'total_votes_deleted': deleted_votes,
                        'total_sessions_deleted': deleted_sessions
                    },
                    ip=request.META.get('REMOTE_ADDR'),
                )
                
                logger.warning(f"Votes reset for event {event.slug} by {request.user.email}")
                
                return Response({'message': f'All votes reset for {event.title}. {deleted_votes} votes deleted.'})
                
        except Exception as e:
            logger.error(f"Failed to reset votes for {event.slug}: {e}", exc_info=True)
            return Response(
                {'error': 'An error occurred while resetting votes.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================
# RECOVER VOTE VIEW (FIXED WITH VALIDATION)
# ============================================

class RecoverVoteView(APIView):
    """
    Admin tool: verify a Paystack reference and manually cast missing votes.
    Fixed with proper validation, quantity limits, and atomic operations.
    """
    permission_classes = [IsAuthenticated]
    
    MAX_RECOVERY_VOTES = 100  # Maximum votes per recovery request

    def post(self, request):
        from django.conf import settings
        from django.db.models import F
        from apps.events.models import Event, Category, Candidate
        from apps.voting.services import encrypt_vote_data

        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        reference = request.data.get('reference', '').strip()
        event_slug = request.data.get('event_slug', '').strip()
        category_id = request.data.get('category_id', '').strip()
        candidate_id = request.data.get('candidate_id', '').strip()

        if not all([reference, event_slug, category_id, candidate_id]):
            return Response(
                {'error': 'reference, event_slug, category_id and candidate_id are all required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check for duplicate recovery (with lock)
        try:
            with transaction.atomic():
                existing_vote = Vote.objects.select_for_update().filter(payment_ref=reference).first()
                if existing_vote:
                    votes_count = Vote.objects.filter(payment_ref=reference).count()
                    return Response({
                        'status': 'already_cast',
                        'message': f'{votes_count} vote(s) already exist for this reference.',
                    })
        except Exception as e:
            logger.error(f"Error checking existing vote: {e}")

        # Verify with Paystack
        try:
            resp = _requests.get(
                f'https://api.paystack.co/transaction/verify/{reference}',
                headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'},
                timeout=10,
            )
            data = resp.json()
        except Exception as e:
            logger.error(f"Paystack API error: {e}")
            return Response(
                {'error': f'Paystack API error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY
            )

        if not (data.get('status') and data.get('data', {}).get('status') == 'success'):
            return Response(
                {'error': 'Payment was not successful on Paystack. Cannot recover.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        txn = data['data']
        paid_kobo = txn.get('amount', 0)
        voter_email = txn.get('customer', {}).get('email', '')

        try:
            event = Event.objects.get(slug=event_slug)
            category = Category.objects.get(id=category_id, event=event)
            candidate = Candidate.objects.get(id=candidate_id, category=category)
        except Exception as e:
            return Response(
                {'error': f'Invalid event/category/candidate: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Calculate quantity from amount paid with validation
        price_kobo = int(float(event.price_per_vote) * 100)
        quantity = max(1, paid_kobo // price_kobo) if price_kobo > 0 else 1
        
        # Validate quantity
        if quantity > self.MAX_RECOVERY_VOTES:
            return Response({
                'error': f'Cannot recover more than {self.MAX_RECOVERY_VOTES} votes at once.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check category vote limits
        if category.max_votes_per_voter and quantity > category.max_votes_per_voter:
            return Response({
                'error': f'Maximum {category.max_votes_per_voter} votes allowed per voter for this category.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Get or create session with atomic transaction
        try:
            with transaction.atomic():
                from django.contrib.auth import get_user_model
                User = get_user_model()
                voter = User.objects.filter(email=voter_email).first()
                
                session, _ = VoteSession.objects.get_or_create(
                    event=event,
                    voter=voter,
                    defaults={
                        'voter_email': voter_email,
                        'ip_address': get_client_ip(request),
                        'voter_name': voter.name if voter else voter_email,
                    }
                )
                
                # Cast votes with integrity hashes
                votes_created = []
                for q in range(quantity):
                    # Generate integrity hash
                    integrity_data = {
                        'event_id': str(event.id),
                        'category_id': str(category.id),
                        'candidate_id': str(candidate.id),
                        'voter_id': str(voter.id) if voter else None,
                        'payment_ref': reference,
                        'timestamp': timezone.now().isoformat(),
                        'manual_recovery': True,
                        'recovered_by': str(request.user.email),
                    }
                    integrity_hash = generate_vote_integrity_hash(integrity_data)
                    
                    vote = Vote.objects.create(
                        session=session,
                        event=event,
                        category=category,
                        candidate=candidate,
                        payment_ref=reference,
                        is_paid=True,
                        ip_address=get_client_ip(request),
                        encrypted_data=encrypt_vote_data(integrity_data),
                        integrity_hash=integrity_hash,
                    )
                    votes_created.append(vote)

                # Update counts using F() expressions with select_for_update
                candidate = Candidate.objects.select_for_update().get(id=candidate.id)
                candidate.vote_count = F('vote_count') + quantity
                candidate.save(update_fields=['vote_count'])
                
                event = Event.objects.select_for_update().get(id=event.id)
                event.total_votes = F('total_votes') + quantity
                event.save(update_fields=['total_votes'])
                
                session.votes_cast += quantity
                session.save(update_fields=['votes_cast'])
                
                # Clear cache
                cache.delete(f'live_results:{event.id}')
                
                # Log the recovery
                log_admin_action(
                    admin_user=request.user,
                    action='manual_recovery',
                    description=f'Manual vote recovery: {quantity} vote(s) for "{candidate.name}" using ref {reference}',
                    event=event,
                    metadata={
                        'reference': reference,
                        'quantity': quantity,
                        'candidate': candidate.name,
                        'voter': voter_email,
                        'integrity_hashes': [v.integrity_hash for v in votes_created]
                    },
                    ip=request.META.get('REMOTE_ADDR'),
                )
                
                logger.info(f"Manual recovery: {quantity} votes recovered for {reference} by {request.user.email}")
                
                return Response({
                    'status': 'recovered',
                    'message': f'Successfully cast {quantity} vote(s) for {candidate.name}.',
                    'quantity': quantity,
                    'candidate': candidate.name,
                    'category': category.name,
                    'voter': voter_email,
                    'integrity_hashes': [v.integrity_hash for v in votes_created]
                })
                
        except Exception as e:
            logger.error(f"Recovery failed for reference {reference}: {e}", exc_info=True)
            return Response(
                {'error': 'An internal error occurred during recovery.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================
# CHECK REFERENCE VIEW
# ============================================

class CheckReferenceView(APIView):
    """Admin tool: check a Paystack reference — was it paid? were votes cast?"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        import requests as _requests

        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        reference = request.query_params.get('reference', '').strip()
        if not reference:
            return Response({'error': 'reference is required.'}, status=status.HTTP_400_BAD_REQUEST)

        votes_cast = Vote.objects.filter(payment_ref=reference).count()

        try:
            resp = _requests.get(
                f'https://api.paystack.co/transaction/verify/{reference}',
                headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'},
                timeout=10,
            )
            txn_data = resp.json().get('data', {})
        except Exception as e:
            logger.error(f"Paystack API error for reference {reference}: {e}")
            return Response(
                {'error': f'Paystack API error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY
            )

        # Try to get saved category/candidate from Payment record
        from apps.payments.models import Payment as PaymentModel
        saved_category_id = None
        saved_candidate_id = None
        try:
            pm = PaymentModel.objects.get(reference=reference)
            saved_category_id = str(pm.category_id) if pm.category_id else None
            saved_candidate_id = str(pm.candidate_id) if pm.candidate_id else None
        except PaymentModel.DoesNotExist:
            pass

        return Response({
            'reference': reference,
            'paystack_status': txn_data.get('status'),
            'amount_paid': txn_data.get('amount', 0) / 100,
            'currency': txn_data.get('currency'),
            'voter_email': txn_data.get('customer', {}).get('email'),
            'paid_at': txn_data.get('paid_at'),
            'votes_cast': votes_cast,
            'needs_recovery': txn_data.get('status') == 'success' and votes_cast == 0,
            'saved_category_id': saved_category_id,
            'saved_candidate_id': saved_candidate_id,
        })


# ============================================
# EXPORT VIEW
# ============================================

class ExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        
        # TODO: implement CSV/PDF export of results for event `slug`
        from django.http import HttpResponse
        return HttpResponse(f"Export stub for {slug} — implement me.", content_type="text/plain")


# ============================================
# ADMIN AUDIT LOG VIEW
# ============================================

class AdminAuditLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

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
            'id': str(log.id),
            'admin': log.admin.email if log.admin else 'system',
            'action': log.action,
            'description': log.description,
            'event': log.event.title if log.event else None,
            'metadata': log.metadata,
            'ip_address': log.ip_address,
            'created_at': log.created_at,
        } for log in logs]

        return Response({'count': len(data), 'results': data})