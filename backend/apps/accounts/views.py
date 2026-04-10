import logging
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from django.utils import timezone
from django.db import transaction, models

from .models import OTP, AdminProfile
from .serializers import (
    RequestOTPSerializer, VerifyOTPSerializer,
    AdminRegisterSerializer, UserDetailSerializer, UpdateProfileSerializer
)

User   = get_user_model()
logger = logging.getLogger(__name__)

# ── Throttle Classes ─────────────────────────────────────────────────────────

class OTPRequestThrottle(AnonRateThrottle):
    scope = 'otp_request'

class OTPVerifyThrottle(AnonRateThrottle):
    scope = 'otp_verify'

class AdminLoginThrottle(AnonRateThrottle):
    scope = 'admin_login'

class CheckUserThrottle(AnonRateThrottle):
    scope = 'check_user'

# ── Helpers ──────────────────────────────────────────────────────────────────

def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    refresh['name']  = user.name
    refresh['role']  = user.role
    refresh['email'] = user.email
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }

def get_client_ip(request):
    """
    Return the real client IP. Reads REMOTE_ADDR (set by the server/proxy)
    which cannot be spoofed by the client. Only falls back to X-Forwarded-For
    if explicitly configured via TRUSTED_PROXY_COUNT in settings.
    """
    from django.conf import settings
    trusted_proxies = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    if trusted_proxies:
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ips = [ip.strip() for ip in xff.split(',') if ip.strip()]
        # Take the IP that is trusted_proxies hops from the right
        # e.g. if 1 proxy: take the second-to-last IP in the chain
        if len(ips) >= trusted_proxies:
            return ips[-trusted_proxies - 1] if len(ips) > trusted_proxies else ips[0]
    return request.META.get('REMOTE_ADDR', '')

def is_ip_banned(ip, prefix):
    return bool(cache.get(f'{prefix}_ban_{ip}'))

def record_fail(ip, prefix, max_fails=5, ban_seconds=1800):
    fail_key = f'{prefix}_fails_{ip}'
    fails = cache.get(fail_key, 0) + 1
    cache.set(fail_key, fails, timeout=ban_seconds)
    if fails >= max_fails:
        cache.set(f'{prefix}_ban_{ip}', True, timeout=ban_seconds)
        cache.delete(fail_key)
        return True
    return False

def clear_fails(ip, prefix):
    cache.delete(f'{prefix}_fails_{ip}')
    cache.delete(f'{prefix}_ban_{ip}')

# ── Views ────────────────────────────────────────────────────────────────────

class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [OTPRequestThrottle]

    def post(self, request):
        ip = get_client_ip(request)

        if is_ip_banned(ip, 'otp'):
            return Response(
                {'error': 'Too many OTP requests. Please wait 30 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        channel = data['channel']
        purpose = data.get('purpose', 'login')
        email   = data.get('email', '').lower().strip()
        phone   = data.get('phone', '').strip()

        # Invalidate previous unused OTPs
        if channel == 'email':
            OTP.objects.filter(email=email, is_used=False, purpose=purpose).update(is_used=True)
        else:
            OTP.objects.filter(phone=phone, is_used=False, purpose=purpose).update(is_used=True)

        code = OTP.generate_code()
        OTP.objects.create(
            email=email if channel == 'email' else None,
            phone=phone if channel == 'sms' else None,
            code=code,
            channel=channel,
            purpose=purpose,
        )

        from apps.notifications.tasks import send_otp_email_task, send_email, base_email, BRAND_NAME, BRAND_TEAL, BRAND_DARK, BRAND_GRAY

        if channel == 'email':
            send_otp_email_task.delay(email, code, purpose)
        else:
            from apps.notifications.tasks import arkesel_generate_otp
            from django.conf import settings
            if settings.DEBUG:
                print(f'\n{"="*40}\n[DEV] OTP for {phone}: {code}\n{"="*40}\n')
                logger.warning(f'[DEV] OTP for {phone}: {code}')
            try:
                arkesel_generate_otp(phone)
            except Exception as e:
                logger.warning(f'Arkesel OTP failed for {phone}: {e}')

        return Response({
            'message': 'OTP sent successfully.',
            'expires_in_minutes': 10,
        }, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [OTPVerifyThrottle]

    @transaction.atomic
    def post(self, request):
        ip = get_client_ip(request)

        if is_ip_banned(ip, 'otp'):
            return Response(
                {'error': 'Too many failed attempts. Your IP is blocked for 30 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        channel = data['channel']
        code    = data['code']
        email   = data.get('email', '').lower().strip()
        phone   = data.get('phone', '').strip()

        if channel == 'email':
            # Email — verify against our DB
            otp_qs = OTP.objects.filter(email=email, code=code, is_used=False)
            otp    = otp_qs.order_by('-created_at').first()

            if not otp:
                banned = record_fail(ip, 'otp', max_fails=5, ban_seconds=1800)
                if banned:
                    return Response(
                        {'error': 'Too many failed attempts. Blocked for 30 minutes.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS
                    )
                return Response({'error': 'Invalid OTP code.'}, status=status.HTTP_400_BAD_REQUEST)

            otp.attempts += 1
            otp.save(update_fields=['attempts'])

            if otp.is_expired:
                record_fail(ip, 'otp')
                return Response(
                    {'error': 'OTP has expired. Please request a new one.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not otp.is_valid:
                record_fail(ip, 'otp')
                return Response({'error': 'OTP is no longer valid.'}, status=status.HTTP_400_BAD_REQUEST)

        else:
            from django.conf import settings
            if settings.DEBUG:
                # In dev, verify against our own DB instead of Arkesel
                otp_obj = OTP.objects.filter(phone=phone, code=code, is_used=False).order_by('-created_at').first()
                verified = otp_obj is not None and not otp_obj.is_expired
            else:
                from apps.notifications.tasks import arkesel_verify_otp
                try:
                    verified = arkesel_verify_otp(phone, code)
                except Exception as e:
                    logger.error(f'Arkesel verify error: {e}')
                    return Response(
                        {'error': 'Could not verify code. Please try again.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            if not verified:
                banned = record_fail(ip, 'otp', max_fails=5, ban_seconds=1800)
                if banned:
                    return Response(
                        {'error': 'Too many failed attempts. Blocked for 30 minutes.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS
                    )
                return Response(
                    {'error': 'Invalid or expired OTP code.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get or create OTP record for the success flow
            otp = OTP.objects.filter(phone=phone, is_used=False).order_by('-created_at').first()
            if not otp:
                otp = OTP.objects.create(
                    phone=phone,
                    code=code,
                    channel='sms',
                    purpose=data.get('purpose', 'login'),
                    is_used=False,
                )

        # ── Success ──────────────────────────────────────────────────────────
        otp.is_used = True
        otp.save(update_fields=['is_used'])
        clear_fails(ip, 'otp')

        if channel == 'email':
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'name':               data.get('name', email.split('@')[0]),
                    'is_verified':        True,
                    'preferred_language': data.get('preferred_language', 'en'),
                }
            )
        else:
            from .serializers import normalize_phone_number
            try:
                normalized_phone = normalize_phone_number(phone)
            except Exception:
                normalized_phone = phone
            phone_clean = normalized_phone.replace('+', '').replace(' ', '')
            existing = User.objects.filter(phone=normalized_phone).order_by('created_at')
            if existing.exists():
                user = existing.first()
                created = False
                # Clean up duplicates silently
                if existing.count() > 1:
                    existing.exclude(id=user.id).delete()
            else:
                user = User.objects.create(
                    phone=normalized_phone,
                    email=f'{phone_clean}@phone.evoting.local',
                    name=data.get('name', normalized_phone),
                    is_verified=True,
                )
                created = True

        user.is_verified   = True
        user.last_login_at = timezone.now()
        user.ip_address    = get_client_ip(request)
        user.save(update_fields=['is_verified', 'last_login_at', 'ip_address'])

        return Response({
            'message':    'Login successful',
            'is_new_user': created,
            'user':        UserDetailSerializer(user).data,
            'tokens':      get_tokens_for_user(user),
        }, status=status.HTTP_200_OK)


class AdminRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != 'superadmin':
            return Response(
                {'error': 'Only superadmins can create admin accounts.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AdminRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if User.objects.filter(email=data['email'].lower()).exists():
            return Response(
                {'error': 'An account with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.create_user(
            email=data['email'].lower(),
            name=data['name'],
            phone=data.get('phone'),
            password=data['password'],
            role=User.Role.ADMIN,
        )
        AdminProfile.objects.create(
            user=user,
            organization=data.get('organization', ''),
        )

        return Response({
            'message': 'Admin account created successfully.',
            'user_id': str(user.id),
        }, status=status.HTTP_201_CREATED)


class AdminLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [AdminLoginThrottle]

    def post(self, request):
        ip = get_client_ip(request)

        if is_ip_banned(ip, 'admin_login'):
            return Response(
                {'error': 'Too many failed attempts. Please wait 15 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        email    = request.data.get('email', '').lower().strip()
        password = request.data.get('password', '')

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            record_fail(ip, 'admin_login', max_fails=5, ban_seconds=900)
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.check_password(password):
            record_fail(ip, 'admin_login', max_fails=5, ban_seconds=900)
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_admin:
            return Response({'error': 'Not an admin account'}, status=status.HTTP_403_FORBIDDEN)

        if not user.is_active:
            return Response({'error': 'Account is suspended.'}, status=status.HTTP_403_FORBIDDEN)

        clear_fails(ip, 'admin_login')
        user.last_login_at = timezone.now()
        user.save(update_fields=['last_login_at'])

        return Response({
            'message': 'Login successful',
            'user':    UserDetailSerializer(user).data,
            'tokens':  get_tokens_for_user(user),
        })


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = UpdateProfileSerializer

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        return Response(UserDetailSerializer(request.user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data.get('refresh'))
            token.blacklist()
            return Response({'message': 'Logged out successfully'})
        except Exception:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


class VoterListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.voting.models import VoteSession
        user = self.request.user
        if user.role not in ['admin', 'superadmin']:
            return User.objects.none()
        if user.role == 'superadmin':
            voter_ids = VoteSession.objects.values_list('voter', flat=True).distinct()
        else:
            voter_ids = VoteSession.objects.filter(
                event__organizer=user
            ).values_list('voter', flat=True).distinct()
        return User.objects.filter(id__in=voter_ids, role='voter')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        search   = request.query_params.get('search', '')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(email__icontains=search) |
                models.Q(phone__icontains=search)
            )
        data = [{
            'id':            str(u.id),
            'name':          u.name,
            'email':         u.email,
            'phone':         u.phone or '',
            'is_active':     u.is_active,
            'is_verified':   u.is_verified,
            'created_at':    u.created_at,
            'last_login_at': u.last_login_at,
        } for u in queryset]
        return Response({'count': len(data), 'results': data})


class VoterDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, voter_id):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied'}, status=403)
        voter    = get_object_or_404(User, id=voter_id, role='voter')
        from apps.voting.models import VoteSession
        sessions = VoteSession.objects.filter(voter=voter).select_related('event')
        return Response({
            'id':            str(voter.id),
            'name':          voter.name,
            'email':         voter.email,
            'phone':         voter.phone or '',
            'is_active':     voter.is_active,
            'is_verified':   voter.is_verified,
            'created_at':    voter.created_at,
            'last_login_at': voter.last_login_at,
            'vote_history':  [{
                'event_title': s.event.title,
                'event_slug':  s.event.slug,
                'votes_cast':  s.votes_cast,
                'voted_at':    s.created_at,
                'is_flagged':  s.is_flagged,
            } for s in sessions]
        })

    def patch(self, request, voter_id):
        if request.user.role not in ['admin', 'superadmin']:
            return Response({'error': 'Permission denied'}, status=403)
        voter     = get_object_or_404(User, id=voter_id, role='voter')
        is_active = request.data.get('is_active')
        if is_active is not None:
            voter.is_active = is_active
            voter.save(update_fields=['is_active'])
        return Response({'message': 'Voter updated', 'is_active': voter.is_active})


class CheckUserView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [CheckUserThrottle]

    def post(self, request):
        email = request.data.get('email', '').lower().strip()
        phone = request.data.get('phone', '').strip()

        if email:
            user = User.objects.filter(email=email).first()
        elif phone:
            from .serializers import normalize_phone_number
            try:
                normalized_phone = normalize_phone_number(phone)
            except Exception:
                normalized_phone = phone
            user = User.objects.filter(phone=normalized_phone).first()
        else:
            return Response({'error': 'Email or phone required.'}, status=400)

        return Response({
            'exists': user is not None,
            'name':   user.name if user else None,
        })


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current  = request.data.get('current_password')
        new_pass = request.data.get('new_password')
        confirm  = request.data.get('confirm_password')

        if not all([current, new_pass, confirm]):
            return Response({'error': 'All fields are required.'}, status=400)
        if new_pass != confirm:
            return Response({'error': 'New passwords do not match.'}, status=400)
        if len(new_pass) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=400)
        if not request.user.check_password(current):
            return Response({'error': 'Current password is incorrect.'}, status=400)

        request.user.set_password(new_pass)
        request.user.save()
        return Response({'message': 'Password changed successfully!'})