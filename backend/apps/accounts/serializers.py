import re
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import OTP, AdminProfile

User = get_user_model()


# ── Sanitization Helpers ──────────────────────────────────────────────────────

def strip_html(value: str) -> str:
    """Remove any HTML/script tags from input."""
    return re.sub(r'<[^>]+>', '', value).strip()

def sanitize_text(value: str) -> str:
    """Strip HTML and normalize whitespace."""
    cleaned = strip_html(value)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned

def normalize_phone_number(value: str) -> str:
    """
    Normalize a Ghanaian phone number to E.164 format (+233XXXXXXXXX).
    Handles:
      - 0241234567     -> +233241234567
      - 233241234567   -> +233241234567
      - +233241234567  -> +233241234567
      - 0 24 123 4567  -> +233241234567 (spaces/dashes stripped)
    Raises ValidationError if the number is not a valid Ghanaian number.
    """
    # Strip whitespace, dashes, parentheses
    cleaned = re.sub(r'[\s\-\(\)]', '', value.strip())

    # Remove leading +
    if cleaned.startswith('+'):
        cleaned = cleaned[1:]

    # Must be digits only at this point
    if not cleaned.isdigit():
        raise serializers.ValidationError(
            'Phone number must contain only digits, spaces, dashes, or +.'
        )

    # Fix: +233 followed by a local number starting with 0 (e.g. +2330241234567 -> +233241234567)
    if cleaned.startswith('2330') and len(cleaned) == 13:
        cleaned = '233' + cleaned[4:]

    # Convert local format (0XXXXXXXXX) to international (233XXXXXXXXX)
    if cleaned.startswith('0') and len(cleaned) == 10:
        cleaned = '233' + cleaned[1:]

    # Accept numbers already in 233XXXXXXXXX format
    if cleaned.startswith('233') and len(cleaned) == 12:
        return '+' + cleaned

    # Fallback: accept other valid international lengths (7-15 digits) as-is
    if 7 <= len(cleaned) <= 15:
        return '+' + cleaned

    raise serializers.ValidationError(
        'Enter a valid phone number (e.g. 0241234567 or +233241234567).'
    )


def validate_phone_number(value: str) -> str:
    """Validate and normalize phone numbers — alias for normalize_phone_number."""
    return normalize_phone_number(value)

def validate_password_strength(value: str) -> str:
    """Enforce strong password rules."""
    if len(value) < 8:
        raise serializers.ValidationError('Password must be at least 8 characters.')
    if not re.search(r'[A-Z]', value):
        raise serializers.ValidationError('Password must contain at least one uppercase letter.')
    if not re.search(r'[a-z]', value):
        raise serializers.ValidationError('Password must contain at least one lowercase letter.')
    if not re.search(r'\d', value):
        raise serializers.ValidationError('Password must contain at least one number.')
    return value


# ── Serializers ───────────────────────────────────────────────────────────────

class UserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = [
            'id', 'name', 'email', 'phone', 'role',
            'is_verified', 'preferred_language',
            'created_at', 'last_login_at'
        ]
        read_only_fields = ['id', 'role', 'is_verified', 'created_at', 'last_login_at']


class RequestOTPSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=['email', 'sms'])
    email   = serializers.EmailField(required=False)
    phone   = serializers.CharField(max_length=20, required=False)
    purpose = serializers.ChoiceField(choices=['login', 'register', 'verify'], default='login')
    name    = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.lower().strip()

    def validate_phone(self, value):
        return validate_phone_number(value)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate(self, data):
        if data['channel'] == 'email' and not data.get('email'):
            raise serializers.ValidationError({'email': 'Email is required for email OTP'})
        if data['channel'] == 'sms' and not data.get('phone'):
            raise serializers.ValidationError({'phone': 'Phone is required for SMS OTP'})
        return data


class VerifyOTPSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=['email', 'sms'])
    email   = serializers.EmailField(required=False)
    phone   = serializers.CharField(max_length=20, required=False)
    code    = serializers.CharField(min_length=4, max_length=10)
    name    = serializers.CharField(max_length=150, required=False, allow_blank=True)
    preferred_language = serializers.ChoiceField(
        choices=['en', 'fr', 'tw', 'ha'], default='en', required=False
    )

    def validate_email(self, value):
        return value.lower().strip()

    def validate_phone(self, value):
        return validate_phone_number(value)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('OTP code must contain only digits.')
        return value.strip()


class AdminRegisterSerializer(serializers.Serializer):
    name         = serializers.CharField(max_length=150)
    email        = serializers.EmailField()
    phone        = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password     = serializers.CharField(min_length=8, write_only=True)
    organization = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_name(self, value):
        cleaned = sanitize_text(value)
        if len(cleaned) < 2:
            raise serializers.ValidationError('Name must be at least 2 characters.')
        if not re.match(r"^[a-zA-Z\s\-'\.]+$", cleaned):
            raise serializers.ValidationError('Name can only contain letters, spaces, hyphens, and apostrophes.')
        return cleaned

    def validate_email(self, value):
        return value.lower().strip()

    def validate_phone(self, value):
        if not value:
            return value
        return validate_phone_number(value)

    def validate_password(self, value):
        return validate_password_strength(value)

    def validate_organization(self, value):
        return sanitize_text(value)


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['name', 'phone', 'preferred_language']

    def validate_name(self, value):
        cleaned = sanitize_text(value)
        if len(cleaned) < 2:
            raise serializers.ValidationError('Name must be at least 2 characters.')
        return cleaned

    def validate_phone(self, value):
        if not value:
            return value
        return validate_phone_number(value)