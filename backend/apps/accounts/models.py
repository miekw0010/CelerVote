import uuid
import random
import string
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone
from django.conf import settings


class UserManager(BaseUserManager):
    def create_user(self, email, name, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.SUPERADMIN)
        extra_fields.setdefault('is_verified', True)
        return self.create_user(email, name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        VOTER      = 'voter',      'Voter'
        ADMIN      = 'admin',      'Event Admin'
        SUPERADMIN = 'superadmin', 'Super Admin'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email      = models.EmailField(unique=True)
    phone      = models.CharField(max_length=20, blank=True, null=True)
    name       = models.CharField(max_length=150)
    role       = models.CharField(max_length=20, choices=Role.choices, default=Role.VOTER)
    is_verified= models.BooleanField(default=False)
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    preferred_language = models.CharField(max_length=10, default='en')
    ip_address    = models.GenericIPAddressField(null=True, blank=True)
    device_info   = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.email})'

    @property
    def is_admin(self):
        return self.role in [self.Role.ADMIN, self.Role.SUPERADMIN]


class OTP(models.Model):
    class Channel(models.TextChoices):
        EMAIL = 'email', 'Email'
        SMS   = 'sms',   'SMS'

    class Purpose(models.TextChoices):
        LOGIN    = 'login',    'Login'
        REGISTER = 'register', 'Register'
        VERIFY   = 'verify',   'Verify'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='otps', null=True, blank=True)
    email      = models.EmailField(null=True, blank=True)
    phone      = models.CharField(max_length=20, null=True, blank=True)
    code       = models.CharField(max_length=10)
    channel    = models.CharField(max_length=10, choices=Channel.choices)
    purpose    = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.LOGIN)
    is_used    = models.BooleanField(default=False)
    attempts   = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'otps'

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(
                minutes=settings.OTP_EXPIRY_MINUTES
            )
        super().save(*args, **kwargs)

    @staticmethod
    def generate_code():
        return ''.join(random.choices(string.digits, k=settings.OTP_LENGTH))

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired and self.attempts < settings.OTP_MAX_ATTEMPTS

    def __str__(self):
        return f'OTP {self.code} for {self.email or self.phone}'


class AdminProfile(models.Model):
    user         = models.OneToOneField(User, on_delete=models.CASCADE, related_name='admin_profile')
    organization = models.CharField(max_length=200, blank=True)
    bio          = models.TextField(blank=True)
    logo         = models.ImageField(upload_to='admin_logos/', null=True, blank=True)
    is_approved  = models.BooleanField(default=False)
    approved_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_admins'
    )
    events_quota = models.IntegerField(default=10)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'admin_profiles'

    def __str__(self):
        return f'Admin: {self.user.name}'