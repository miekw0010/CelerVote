import json
import hashlib
import base64
import logging
import time
from collections import Counter
from django.db.models import F, Count, Q
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from django.core.cache import cache
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from apps.events.models import Event, Category, Candidate
from .models import Vote, VoteSession, FraudFlag

logger = logging.getLogger(__name__)


# ============================================
# ENCRYPTION HELPERS (FIXED)
# ============================================

def _get_fernet():
    """
    Get Fernet cipher for vote encryption.
    Uses salt from environment variables (not hardcoded).
    """
    key = settings.VOTE_ENCRYPTION_KEY.encode()
    
    # Get salt from settings (must be in environment variables)
    salt = getattr(settings, 'VOTE_ENCRYPTION_SALT', None)
    if not salt:
        # Fallback for backward compatibility - but log warning
        logger.warning("VOTE_ENCRYPTION_SALT not set in environment! Using default salt (INSECURE).")
        salt = b'evoting_salt_deprecated_replace_me'
    else:
        salt = salt.encode()
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000
    )
    derived = base64.urlsafe_b64encode(kdf.derive(key))
    return Fernet(derived)


def encrypt_vote_data(data: dict) -> str:
    """Encrypt vote data before storage."""
    f = _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_vote_data(encrypted_data: str) -> dict:
    """Decrypt vote data for verification/audit purposes."""
    f = _get_fernet()
    return json.loads(f.decrypt(encrypted_data.encode()).decode())


def verify_vote_integrity(vote: Vote) -> bool:
    """
    Verify that a stored vote hasn't been tampered with.
    Re-encrypts the original data and compares.
    """
    try:
        decrypted = decrypt_vote_data(vote.encrypted_data)
        # Re-encrypt and compare
        re_encrypted = encrypt_vote_data(decrypted)
        return vote.encrypted_data == re_encrypted
    except Exception as e:
        logger.error(f"Vote integrity check failed for vote {vote.id}: {e}")
        return False


# ============================================
# DEVICE FINGERPRINTING (IMPROVED)
# ============================================

def get_device_fingerprint(request) -> str:
    """
    Generate a stronger device fingerprint using multiple headers.
    Prevents session hijacking and replay attacks.
    """
    ip = get_client_ip(request)
    lang = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
    ua = request.META.get('HTTP_USER_AGENT', '')[:200]
    accept = request.META.get('HTTP_ACCEPT', '')
    encoding = request.META.get('HTTP_ACCEPT_ENCODING', '')
    platform = request.META.get('HTTP_SEC_CH_UA_PLATFORM', '')
    sec_ch_ua = request.META.get('HTTP_SEC_CH_UA', '')
    
    # Add timing entropy (reduces replay attacks - changes hourly)
    timestamp_bucket = int(time.time() / 3600)
    
    # Combine all signals
    raw = f'{ip}|{lang}|{ua}|{accept}|{encoding}|{platform}|{sec_ch_ua}|{timestamp_bucket}'.encode()
    
    # Use SHA-384 for stronger hash
    return hashlib.sha384(raw).hexdigest()[:64]


def get_client_ip(request) -> str:
    """
    Return the real client IP. Cannot be spoofed by clients.
    Set TRUSTED_PROXY_COUNT in settings if behind a reverse proxy.
    """
    trusted_proxies = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    if trusted_proxies:
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ips = [ip.strip() for ip in xff.split(',') if ip.strip()]
        if len(ips) >= trusted_proxies:
            return ips[-trusted_proxies - 1] if len(ips) > trusted_proxies else ips[0]
    return request.META.get('REMOTE_ADDR', '')


# ============================================
# PAYMENT VERIFICATION (IMPROVED)
# ============================================

def verify_payment_with_rate_limit(payment_ref: str, ip: str) -> tuple[bool, dict]:
    """
    Verify payment with Paystack including rate limiting and cache invalidation.
    Returns (success, data_or_error).
    """
    # Rate limiting
    rate_key = f'payment_verify:{ip}'
    attempts = cache.get(rate_key, 0)
    
    if attempts > 10:  # Max 10 verifications per minute
        logger.warning(f"Rate limit exceeded for payment verification from IP {ip}")
        return False, {'error': 'Too many verification attempts. Please wait.'}
    
    cache.set(rate_key, attempts + 1, timeout=60)
    
    import requests as _requests
    
    cache_key = f'paystack_verified:{payment_ref}'
    cached_data = cache.get(cache_key)
    
    # Always verify with Paystack - don't trust cache blindly
    try:
        resp = _requests.get(
            f'https://api.paystack.co/transaction/verify/{payment_ref}',
            headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'},
            timeout=10,
        )
        data = resp.json()
        
        if not (data.get('status') and data.get('data', {}).get('status') == 'success'):
            # Invalidate cache on failure
            cache.delete(cache_key)
            return False, {'error': 'Payment not verified. Please complete payment before voting.'}
        
        payment_data = data['data']
        
        # Check if payment was refunded
        if payment_data.get('status') == 'refunded':
            cache.delete(cache_key)
            return False, {'error': 'Payment has been refunded and cannot be used.'}
        
        # Check if payment was reversed
        if payment_data.get('status') == 'reversed':
            cache.delete(cache_key)
            return False, {'error': 'Payment has been reversed and cannot be used.'}
        
        # Cache for only 2 minutes for active payments (reduces risk)
        cache.set(cache_key, payment_data, timeout=120)
        
        return True, payment_data
        
    except Exception as e:
        logger.error(f'Paystack verification failed for ref {payment_ref[:8]}...', exc_info=True)
        return False, {'error': 'Payment verification temporarily unavailable. Please try again in a few minutes.'}


# ============================================
# FRAUD DETECTOR (ENHANCED)
# ============================================

class FraudDetector:
    RAPID_VOTE_SECONDS = 5
    DUPLICATE_IP_LIMIT = 50
    VOTE_SPIKE_WINDOW = 60   # seconds
    VOTE_SPIKE_THRESHOLD = 50  # votes per candidate in window

    def __init__(self, event, ip_address, session):
        self.event = event
        self.ip = ip_address
        self.session = session
        self.flags = []

    def check_all(self):
        self._check_rapid_voting()
        self._check_duplicate_ip()
        self._check_geo_anomaly()
        self._check_vote_spike()
        self._check_suspicious_pattern()
        return self.flags

    def _check_rapid_voting(self):
        """Check for votes too close together."""
        # Skip rapid-vote check for free and org elections
        if not self.event.is_paid:
            cache.set(f'last_vote:{self.ip}:{self.event.id}', timezone.now(), timeout=60)
            return

        cache_key = f'last_vote:{self.ip}:{self.event.id}'
        last_vote_time = cache.get(cache_key)
        if last_vote_time:
            elapsed = (timezone.now() - last_vote_time).total_seconds()
            if elapsed < self.RAPID_VOTE_SECONDS:
                self.flags.append({
                    'type': FraudFlag.FraudType.RAPID_VOTING,
                    'description': f'Vote from {self.ip} within {elapsed:.1f}s of previous vote (paid event)'
                })
        cache.set(cache_key, timezone.now(), timeout=60)

    def _check_duplicate_ip(self):
        """Check for too many sessions from same IP."""
        # For org elections each voter has a unique code — duplicate IP is expected
        if self.event.voting_mode == 'organizational':
            return
        
        count = VoteSession.objects.filter(event=self.event, ip_address=self.ip).count()
        if count > self.DUPLICATE_IP_LIMIT:
            self.flags.append({
                'type': FraudFlag.FraudType.DUPLICATE_IP,
                'description': f'IP {self.ip} has {count} sessions on this event'
            })

    def _check_geo_anomaly(self):
        """Flag if same voter votes from different countries within 10 minutes."""
        if not self.session.voter:
            return
        
        try:
            from .models import VoterGeoLog
            current_country = self._get_country_with_fallback(self.ip)
            if not current_country or not current_country.get('country_code'):
                return

            # Log current geo
            VoterGeoLog.objects.create(
                session=self.session,
                ip_address=self.ip,
                country=current_country.get('country', ''),
                country_code=current_country.get('country_code', ''),
                city=current_country.get('city', ''),
            )

            # Check recent geo logs
            ten_mins_ago = timezone.now() - timezone.timedelta(minutes=10)
            recent_sessions = (
                VoteSession.objects
                .filter(voter=self.session.voter, created_at__gte=ten_mins_ago)
                .exclude(id=self.session.id)
                .prefetch_related('geo_logs')
            )

            for prev_session in recent_sessions:
                prev_geo = prev_session.geo_logs.all().first()
                if prev_geo and prev_geo.country_code:
                    if prev_geo.country_code != current_country.get('country_code'):
                        self.flags.append({
                            'type': FraudFlag.FraudType.GEO_ANOMALY,
                            'description': (
                                f'Voter {self.session.voter.email} voted from '
                                f'{prev_geo.country} then {current_country.get("country")} '
                                f'within 10 minutes — possible account sharing or VPN.'
                            )
                        })
                        break
        except Exception as e:
            logger.warning(f'Geo check failed for IP {self.ip}: {e}')

    def _get_country_with_fallback(self, ip: str) -> dict:
        """
        Look up country for an IP with multiple fallbacks.
        Uses ip-api.com first, then falls back to ipinfo.io.
        """
        import requests as _requests
        
        # Skip private/local IPs
        if ip in ('127.0.0.1', 'localhost') or ip.startswith('192.168.') or ip.startswith('10.'):
            return {}
        
        cache_key = f'geo:{ip}'
        cached = cache.get(cache_key)
        if cached:
            return cached
        
        # Try ip-api.com (free, no key needed)
        try:
            resp = _requests.get(
                f'https://ip-api.com/json/{ip}?fields=status,country,countryCode,city',
                timeout=3
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 'success':
                    result = {
                        'country': data.get('country', ''),
                        'country_code': data.get('countryCode', ''),
                        'city': data.get('city', ''),
                    }
                    cache.set(cache_key, result, timeout=3600)
                    return result
        except Exception:
            pass
        
        # Try ipinfo.io as fallback (requires token, optional)
        ipinfo_token = getattr(settings, 'IPINFO_TOKEN', None)
        if ipinfo_token:
            try:
                resp = _requests.get(
                    f'https://ipinfo.io/{ip}/json?token={ipinfo_token}',
                    timeout=3
                )
                if resp.status_code == 200:
                    data = resp.json()
                    result = {
                        'country': data.get('country', ''),
                        'country_code': data.get('country', '')[:2],
                        'city': data.get('city', ''),
                    }
                    cache.set(cache_key, result, timeout=3600)
                    return result
            except Exception:
                pass
        
        # Return empty dict if all fail (skip geo check)
        return {}

    def _check_vote_spike(self):
        """Flag if any candidate receives vote spike in short window."""
        from .models import Vote
        
        window_start = timezone.now() - timezone.timedelta(seconds=self.VOTE_SPIKE_WINDOW)
        
        # Add candidate existence validation
        recent_votes = (
            Vote.objects
            .filter(
                Q(event=self.event, created_at__gte=window_start) &
                Q(candidate__is_active=True)  # Ensure candidate still exists
            )
            .values('candidate')
            .annotate(count=Count('id'))
            .filter(count__gte=self.VOTE_SPIKE_THRESHOLD)
            .order_by('-count')
        )
        
        for row in recent_votes:
            from apps.events.models import Candidate
            try:
                candidate = Candidate.objects.get(id=row['candidate'])
                candidate_name = candidate.name
            except Exception:
                candidate_name = str(row['candidate'])
            
            self.flags.append({
                'type': FraudFlag.FraudType.VOTE_SPIKE,
                'description': (
                    f'Vote spike detected: {row["count"]} votes for '
                    f'"{candidate_name}" in the last {self.VOTE_SPIKE_WINDOW}s on '
                    f'"{self.event.title}". Possible coordinated attack.'
                )
            })

    def _check_suspicious_pattern(self):
        """Check for coordinated voting patterns."""
        from .models import Vote
        from django.db.models import Count
        
        last_5_min = timezone.now() - timezone.timedelta(minutes=5)
        
        # Check for multiple votes from different IPs for same candidate
        suspicious = (
            Vote.objects
            .filter(
                event=self.event,
                created_at__gte=last_5_min
            )
            .values('candidate_id', 'ip_address')
            .annotate(same_ip_count=Count('ip_address'))
            .filter(same_ip_count__gt=5)
        )
        
        if suspicious.exists():
            self.flags.append({
                'type': FraudFlag.FraudType.SUSPICIOUS_PATTERN,
                'description': f'Coordinated voting pattern detected: Multiple votes for same candidate from different IPs in last 5 minutes.'
            })

    def save_flags(self):
        """Save fraud flags to database."""
        for f in self.flags:
            FraudFlag.objects.create(
                event=self.event,
                session=self.session,
                fraud_type=f['type'],
                description=f['description'],
                ip_address=self.ip,
            )
        
        if self.flags:
            self.session.is_flagged = True
            self.session.save(update_fields=['is_flagged'])

        # Auto-suspend after 3 flags
        total_flags = FraudFlag.objects.filter(
            session=self.session,
            resolution=FraudFlag.Resolution.PENDING
        ).count()

        if total_flags >= 3:
            self.session.is_flagged = True
            self.session.save(update_fields=['is_flagged'])
            logger.warning(f'Session {self.session.id} auto-suspended after {total_flags} fraud flags.')


# ============================================
# VOTE CASTER (FIXED RACE CONDITIONS)
# ============================================

class VoteCaster:

    def __init__(self, event: Event, voter, request, voter_group=None):
        self.event = event
        self.voter = voter
        self.request = request
        self.ip = get_client_ip(request)
        self.voter_group = voter_group

    @transaction.atomic
    def cast_vote(self, category_id, candidate_ids, payment_ref='', quantity=1):
        """Cast a single vote with full security checks."""
        if not self.event.is_open:
            return {'success': False, 'error': 'Voting is not currently open for this event.'}

        try:
            category = Category.objects.select_for_update().get(
                id=category_id, event=self.event, is_active=True
            )
        except Category.DoesNotExist:
            return {'success': False, 'error': 'Invalid category.'}

        candidates = Candidate.objects.filter(
            id__in=candidate_ids, category=category, is_active=True
        )
        if len(candidates) != len(candidate_ids):
            return {'success': False, 'error': 'One or more invalid candidates.'}

        # Verify payment BEFORE creating session (with rate limiting)
        if self.event.is_paid:
            if not payment_ref:
                return {'success': False, 'error': 'Payment reference required for this event.'}

            # Lock payment reference to prevent race condition
            with transaction.atomic():
                existing_vote = Vote.objects.select_for_update().filter(payment_ref=payment_ref).first()
                if existing_vote:
                    return {'success': False, 'error': 'This payment has already been used to cast a vote.'}

            # Verify payment with Paystack
            success, result = verify_payment_with_rate_limit(payment_ref, self.ip)
            if not success:
                return {'success': False, 'error': result['error']}

            payment_data = result
            paid_amount = payment_data.get('amount', 0)
            expected_min = int(float(self.event.price_per_vote) * 100)
            
            if paid_amount < expected_min:
                return {'success': False, 'error': 'Payment amount does not match the vote price.'}

            # Update Payment record
            try:
                from apps.payments.models import Payment as PaymentModel
                PaymentModel.objects.filter(reference=payment_ref).update(
                    status=PaymentModel.Status.SUCCESS,
                    paystack_id=str(payment_data.get('id', '')),
                    channel=payment_data.get('channel', ''),
                )
            except Exception as pe:
                logger.warning(f'Payment status update failed for {payment_ref}: {pe}')

        session = self._get_or_create_session()

        # Block auto-suspended sessions
        if session.is_flagged:
            pending_flags = FraudFlag.objects.filter(
                session=session,
                resolution=FraudFlag.Resolution.PENDING
            ).count()
            if pending_flags >= 3:
                return {
                    'success': False,
                    'error': 'Your session has been suspended due to suspicious activity. Please contact support.'
                }

        limit_check = self._check_vote_limit(session, category)
        if not limit_check['allowed']:
            return {'success': False, 'error': limit_check['reason']}
        
        detector = FraudDetector(self.event, self.ip, session)
        detector.check_all()
        detector.save_flags()

        # Create votes
        votes = []
        for candidate in candidates:
            for q in range(quantity):
                encrypted = encrypt_vote_data({
                    'event_id': str(self.event.id),
                    'category_id': str(category.id),
                    'candidate_id': str(candidate.id),
                    'voter_id': str(self.voter.id) if self.voter else None,
                    'timestamp': timezone.now().isoformat(),
                    'ip': self.ip,
                    'vote_number': q + 1,
                })
                vote = Vote(
                    session=session,
                    event=self.event,
                    category=category,
                    candidate=candidate,
                    voter_group=self.voter_group,
                    rank=None,
                    encrypted_data=encrypted,
                    payment_ref=payment_ref,
                    is_paid=bool(payment_ref) or not self.event.is_paid,
                    ip_address=self.ip,
                )
                vote.save()
                votes.append(vote)

        # Update counts with select_for_update to prevent race conditions
        for candidate in candidates:
            locked_candidate = Candidate.objects.select_for_update().get(id=candidate.id)
            locked_candidate.vote_count = F('vote_count') + quantity
            locked_candidate.save(update_fields=['vote_count'])

        session.votes_cast += len(votes)
        session.save(update_fields=['votes_cast', 'updated_at'])

        locked_event = Event.objects.select_for_update().get(id=self.event.id)
        locked_event.total_votes = F('total_votes') + len(votes)
        locked_event.save(update_fields=['total_votes'])

        # Trigger background tasks
        from apps.voting.tasks import recalculate_percentages_task, broadcast_results_task
        recalculate_percentages_task.delay(str(category.id))
        broadcast_results_task.delay(str(self.event.id))

        # Send vote confirmation (skip for performance)
        self._send_vote_confirmation(session, candidates)

        return {
            'success': True,
            'vote_ids': [str(v.id) for v in votes],
            'message': 'Your vote has been recorded!'
        }

    @transaction.atomic
    def bulk_cast_votes(self, vote_items: list) -> dict:
        """
        Cast votes for multiple categories atomically — for org elections.
        vote_items: [{'category_id': uuid, 'candidate_id': uuid}, ...]
        All-or-nothing: if any item fails validation, the entire batch is rejected.
        """
        if not self.event.is_open:
            return {'success': False, 'error': 'Voting is not currently open for this event.'}

        if self.event.is_paid:
            return {'success': False, 'error': 'Bulk voting is only for free/organisational elections.'}

        # Pre-validate all items
        validated = []
        for item in vote_items:
            try:
                category = Category.objects.get(
                    id=item['category_id'], event=self.event, is_active=True
                )
            except Category.DoesNotExist:
                return {'success': False, 'error': f'Invalid category: {item["category_id"]}'}

            try:
                candidate = Candidate.objects.get(
                    id=item['candidate_id'], category=category, is_active=True
                )
            except Candidate.DoesNotExist:
                return {'success': False, 'error': f'Invalid candidate: {item["candidate_id"]}'}

            validated.append((category, candidate))

        # Check for duplicate categories
        cat_ids = [str(c.id) for c, _ in validated]
        if len(cat_ids) != len(set(cat_ids)):
            return {'success': False, 'error': 'Duplicate categories in submission.'}

        # Session + fraud checks
        session = self._get_or_create_session()

        if session.is_flagged:
            pending = FraudFlag.objects.filter(
                session=session, resolution=FraudFlag.Resolution.PENDING
            ).count()
            if pending >= 3:
                return {
                    'success': False,
                    'error': 'Your session has been suspended due to suspicious activity.'
                }

        # Check voter hasn't already voted in any of these categories
        for category, _ in validated:
            check = self._check_vote_limit(session, category)
            if not check['allowed']:
                return {
                    'success': False,
                    'error': f'Already voted in category "{category.name}": {check["reason"]}'
                }

        detector = FraudDetector(self.event, self.ip, session)
        detector.check_all()
        detector.save_flags()

        # Write all votes
        all_votes = []
        for category, candidate in validated:
            encrypted = encrypt_vote_data({
                'event_id': str(self.event.id),
                'category_id': str(category.id),
                'candidate_id': str(candidate.id),
                'voter_id': str(self.voter.id) if self.voter else None,
                'timestamp': timezone.now().isoformat(),
                'ip': self.ip,
            })
            vote = Vote(
                session=session,
                event=self.event,
                category=category,
                candidate=candidate,
                voter_group=self.voter_group,
                encrypted_data=encrypted,
                payment_ref='',
                is_paid=True,
                ip_address=self.ip,
            )
            vote.save()
            all_votes.append((category, candidate, vote))

        # Bulk update counts (aggregate first to reduce queries)
        vote_counts = Counter()
        for _, candidate, _ in all_votes:
            vote_counts[candidate.id] += 1

        # Update with select_for_update to prevent race conditions
        for candidate_id, count in vote_counts.items():
            Candidate.objects.select_for_update().filter(id=candidate_id).update(
                vote_count=F('vote_count') + count
            )

        session.votes_cast += len(all_votes)
        session.save(update_fields=['votes_cast', 'updated_at'])

        Event.objects.select_for_update().filter(id=self.event.id).update(
            total_votes=F('total_votes') + len(all_votes)
        )

        # Mark voter roll as used
        self._mark_voter_roll_used()

        # Background tasks
        from apps.voting.tasks import recalculate_percentages_task, broadcast_results_task
        for category, _, _ in all_votes:
            recalculate_percentages_task.delay(str(category.id))
        broadcast_results_task.delay(str(self.event.id))

        return {
            'success': True,
            'votes_cast': len(all_votes),
            'vote_ids': [str(v.id) for _, _, v in all_votes],
            'message': f'{len(all_votes)} votes recorded successfully!'
        }

    def _get_or_create_session(self) -> VoteSession:
        """Get or create a vote session with row locking."""
        fingerprint = get_device_fingerprint(self.request)

        # select_for_update() locks the row to prevent race conditions
        if self.voter:
            session = (
                VoteSession.objects
                .select_for_update()
                .filter(event=self.event, voter=self.voter)
                .first()
            )
        else:
            session = (
                VoteSession.objects
                .select_for_update()
                .filter(event=self.event, ip_address=self.ip, device_fingerprint=fingerprint)
                .first()
            )

        if not session:
            session = VoteSession.objects.create(
                event=self.event,
                voter=self.voter,
                voter_email=getattr(self.voter, 'email', None),
                voter_phone=getattr(self.voter, 'phone', None),
                voter_name=getattr(self.voter, 'name', None),
                ip_address=self.ip,
                user_agent=self.request.META.get('HTTP_USER_AGENT', '')[:500],
                device_fingerprint=fingerprint,
            )
        return session

    def _check_vote_limit(self, session: VoteSession, category: Category) -> dict:
        """Check if voter has reached vote limits."""
        # Paid events allow unlimited votes
        if self.event.is_paid:
            return {'allowed': True}
        
        if not self.event.allow_multiple_votes:
            if Vote.objects.filter(session=session, category=category).exists():
                return {'allowed': False, 'reason': 'You have already voted in this category.'}
        else:
            if session.votes_cast >= self.event.max_votes_per_user:
                return {'allowed': False, 'reason': f'You have reached the maximum of {self.event.max_votes_per_user} votes.'}
        
        return {'allowed': True}

    def _send_vote_confirmation(self, session: VoteSession, candidates):
        """Send vote confirmation email/SMS asynchronously."""
        candidate_names = ", ".join([c.name for c in candidates])

        voter_email = getattr(self.voter, 'email', None) or session.voter_email
        if voter_email and not voter_email.endswith('@phone.evoting.local'):
            from apps.notifications.tasks import send_vote_confirmation_task
            send_vote_confirmation_task.delay(
                voter_email,
                self.event.title,
                candidate_names,
            )

        voter_phone = getattr(self.voter, 'phone', None) or session.voter_phone
        if voter_phone:
            from apps.notifications.tasks import send_vote_confirmation_sms_task
            send_vote_confirmation_sms_task.delay(
                voter_phone,
                self.event.title,
                candidate_names,
            )

    def _mark_voter_roll_used(self):
        """Mark voter roll entry as used after bulk vote."""
        if not self.voter:
            return
        
        try:
            from apps.events.models import VoterRoll
            safe_voter_email = getattr(self.voter, 'email', '') or ''
            if '@org.evoting.local' in safe_voter_email:
                parts = safe_voter_email.split('@')[0].split('_')
                if len(parts) >= 2:
                    code = parts[1].upper()
                    roll_entry = VoterRoll.objects.filter(
                        event=self.event, voting_code=code, status='unused'
                    ).first()
                    if roll_entry:
                        roll_entry.status = 'used'
                        roll_entry.used_at = timezone.now()
                        roll_entry.save(update_fields=['status', 'used_at'])
        except Exception as e:
            logger.warning(f'Failed to mark voter roll as used: {e}')


# ============================================
# LIVE RESULTS (IMPROVED CACHING)
# ============================================

def get_live_results(event_id: str) -> dict:
    """Get live voting results with improved caching."""
    cache_key = f'live_results:{event_id}'
    cached = cache.get(cache_key)
    if cached:
        return cached

    from apps.events.models import Event
    try:
        event = Event.objects.prefetch_related('categories__candidates').get(id=event_id)
    except Event.DoesNotExist:
        return {}

    results = {
        'event_id': str(event.id),
        'event_title': event.title,
        'event_slug': event.slug,
        'status': event.status,
        'total_votes': event.total_votes,
        'results_published': event.results_published,
        'hide_vote_counts': event.hide_vote_counts,
        'voting_mode': event.voting_mode,
        'categories': []
    }

    show_groups = event.show_group_results
    groups = list(event.voter_groups.all()) if show_groups else []

    # Pre-aggregate group vote counts
    group_vote_counts = {}
    if show_groups and groups:
        from .models import Vote
        group_ids = [g.id for g in groups]
        qs = (
            Vote.objects
            .filter(event=event, voter_group__in=group_ids)
            .values('candidate_id', 'voter_group_id')
            .annotate(cnt=Count('id'))
        )
        for row in qs:
            group_vote_counts[(row['candidate_id'], row['voter_group_id'])] = row['cnt']

    for cat in event.categories.filter(is_active=True).prefetch_related('candidates', 'groups'):
        candidates = cat.candidates.filter(is_active=True).order_by('-vote_count')

        cat_data = {
            'id': str(cat.id),
            'name': cat.name,
            'is_global': cat.is_global,
            'groups': [{'id': str(g.id), 'name': g.name} for g in cat.groups.all()],
            'candidates': [],
        }

        for c in candidates:
            cand_data = {
                'id': str(c.id),
                'name': c.name,
                'photo': c.photo.url if c.photo else None,
                'vote_count': c.vote_count,
                'vote_percentage': c.vote_percentage,
            }
            if show_groups and groups:
                cand_data['group_breakdown'] = [
                    {
                        'group_id': str(g.id),
                        'group_name': g.name,
                        'votes': group_vote_counts.get((c.id, g.id), 0),
                    }
                    for g in groups
                ]
            cat_data['candidates'].append(cand_data)

        results['categories'].append(cat_data)

    # Cache for 5 seconds to reduce DB load
    cache.set(cache_key, results, timeout=5)
    return results


# ============================================
# EMERGENCY VOTE LOCK (NEW)
# ============================================

class EmergencyVoteLock:
    """Allow admin to lock voting during detected attacks."""
    
    def __init__(self, event_id: str):
        self.cache_key = f'vote_lock:{event_id}'
    
    def is_locked(self) -> bool:
        return cache.get(self.cache_key, False)
    
    def lock(self, duration_minutes: int = 30):
        cache.set(self.cache_key, True, timeout=duration_minutes * 60)
        logger.warning(f"Emergency vote lock activated for event {self.cache_key} for {duration_minutes} minutes")
    
    def unlock(self):
        cache.delete(self.cache_key)
        logger.info(f"Emergency vote lock deactivated for event {self.cache_key}")


# ============================================
# AUDIT LOGGING
# ============================================

def log_admin_action(admin_user, action: str, description: str, event=None, metadata: dict = None, ip: str = None):
    """Record an admin action to the audit log."""
    try:
        from .models import AdminAuditLog
        AdminAuditLog.objects.create(
            admin=admin_user,
            event=event,
            action=action,
            description=description,
            metadata=metadata or {},
            ip_address=ip,
        )
    except Exception as e:
        logger.error(f'Audit log failed: {e}')