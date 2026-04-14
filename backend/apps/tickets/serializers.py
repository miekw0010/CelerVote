from rest_framework import serializers
from .models import TicketEvent, TicketTier, Ticket


def validate_image(value, max_mb=5):
    if not value:
        return value
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    content_type  = getattr(value, 'content_type', '')
    if content_type and content_type not in allowed_types:
        raise serializers.ValidationError(
            f'Invalid image type. Only JPEG, PNG, WebP and GIF are allowed.'
        )
    max_bytes = max_mb * 1024 * 1024
    if hasattr(value, 'size') and value.size > max_bytes:
        raise serializers.ValidationError(f'Image too large. Maximum size is {max_mb}MB.')
    return value


class TicketTierSerializer(serializers.ModelSerializer):
    tickets_sold      = serializers.ReadOnlyField()
    tickets_remaining = serializers.ReadOnlyField()
    is_sold_out       = serializers.ReadOnlyField()

    class Meta:
        model  = TicketTier
        fields = [
            'id', 'name', 'description', 'price', 'quantity',
            'perks', 'color', 'order', 'is_active',
            'tickets_sold', 'tickets_remaining', 'is_sold_out',
            'created_at',
        ]


class TicketTierPublicSerializer(serializers.ModelSerializer):
    """Public-facing tier serializer — hides sales counts and total quantity."""
    tickets_remaining = serializers.ReadOnlyField()
    is_sold_out       = serializers.ReadOnlyField()

    class Meta:
        model  = TicketTier
        fields = [
            'id', 'name', 'description', 'price',
            'perks', 'color', 'order', 'is_active',
            'tickets_remaining', 'is_sold_out',
            # ❌ No: tickets_sold, quantity, created_at
        ]


class TicketTierCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TicketTier
        fields = ['name', 'description', 'price', 'quantity', 'perks', 'color', 'order', 'is_active']


class TicketEventListSerializer(serializers.ModelSerializer):
    tiers              = TicketTierSerializer(many=True, read_only=True)
    total_tickets_sold = serializers.ReadOnlyField()
    total_revenue      = serializers.ReadOnlyField()
    organizer_name     = serializers.SerializerMethodField()

    class Meta:
        model  = TicketEvent
        fields = [
            'id', 'title', 'slug', 'description', 'venue',
            'event_date', 'end_date', 'banner', 'is_active', 'is_published',
            'organizer_name', 'tiers', 'total_tickets_sold', 'total_revenue',
            'created_at',
        ]

    def get_organizer_name(self, obj):
        return obj.organizer.name if hasattr(obj.organizer, "name") else obj.organizer.email


class TicketEventPublicListSerializer(serializers.ModelSerializer):
    """Public-facing serializer — hides revenue and sales data."""
    tiers          = TicketTierPublicSerializer(many=True, read_only=True)
    organizer_name = serializers.SerializerMethodField()

    class Meta:
        model  = TicketEvent
        fields = [
            'id', 'title', 'slug', 'description', 'venue',
            'event_date', 'end_date', 'banner', 'is_active', 'is_published',
            'organizer_name', 'tiers',
            # ❌ No: total_tickets_sold, total_revenue, created_at
        ]

    def get_organizer_name(self, obj):
        return obj.organizer.name if hasattr(obj.organizer, "name") else obj.organizer.email


class TicketEventCreateSerializer(serializers.ModelSerializer):
    tiers = TicketTierCreateSerializer(many=True, required=False)

    class Meta:
        model  = TicketEvent
        fields = [
            'title', 'slug', 'description', 'venue',
            'event_date', 'end_date', 'banner', 'is_active', 'is_published', 'tiers',
        ]

    def validate_banner(self, value):
        return validate_image(value, max_mb=5)

    def create(self, validated_data):
        tiers_data = validated_data.pop('tiers', [])
        request    = self.context.get('request')
        event      = TicketEvent.objects.create(organizer=request.user, **validated_data)
        for tier_data in tiers_data:
            TicketTier.objects.create(event=event, **tier_data)
        return event


class TicketEventUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TicketEvent
        fields = [
            'title', 'description', 'venue',
            'event_date', 'end_date', 'banner', 'is_active', 'is_published',
        ]


class TicketSerializer(serializers.ModelSerializer):
    event_title  = serializers.SerializerMethodField()
    event_venue  = serializers.SerializerMethodField()
    event_date   = serializers.SerializerMethodField()
    tier_name    = serializers.SerializerMethodField()
    tier_color   = serializers.SerializerMethodField()
    qr_code_url  = serializers.SerializerMethodField()

    class Meta:
        model  = Ticket
        fields = [
            'id', 'ticket_code', 'buyer_name', 'buyer_email', 'buyer_phone',
            'status', 'quantity', 'total_amount', 'paystack_ref',
            'event_title', 'event_venue', 'event_date',
            'tier_name', 'tier_color', 'qr_code_url',
            'created_at', 'paid_at',
        ]

    def get_event_title(self, obj):
        return obj.tier.event.title

    def get_event_venue(self, obj):
        return obj.tier.event.venue

    def get_event_date(self, obj):
        return obj.tier.event.event_date

    def get_tier_name(self, obj):
        return obj.tier.name

    def get_tier_color(self, obj):
        return obj.tier.color

    def get_qr_code_url(self, obj):
        if obj.qr_code:
            return obj.qr_code.url
        return None


class TicketPurchaseSerializer(serializers.Serializer):
    tier_id     = serializers.UUIDField()
    quantity    = serializers.IntegerField(min_value=1, max_value=10, default=1)
    buyer_name  = serializers.CharField(max_length=255)
    buyer_email = serializers.EmailField(required=False, allow_blank=True)
    buyer_phone = serializers.CharField(max_length=30)

    def validate_buyer_name(self, value):
        import re
        cleaned = re.sub(r'<[^>]+>', '', value).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        if len(cleaned) < 2:
            raise serializers.ValidationError('Name must be at least 2 characters.')
        return cleaned

    def validate_buyer_phone(self, value):
        from apps.accounts.serializers import normalize_phone_number
        return normalize_phone_number(value)

    def validate_buyer_email(self, value):
        if value:
            return value.lower().strip()
        return value

    def validate_tier_id(self, value):
        try:
            tier = TicketTier.objects.get(id=value, is_active=True)
        except TicketTier.DoesNotExist:
            raise serializers.ValidationError("Ticket tier not found.")
        if tier.is_sold_out:
            raise serializers.ValidationError("This ticket tier is sold out.")
        return value

    def validate(self, attrs):
        tier_id  = attrs['tier_id']
        quantity = attrs['quantity']
        try:
            tier = TicketTier.objects.get(id=tier_id)
            if tier.tickets_remaining < quantity:
                raise serializers.ValidationError(
                    f"Only {tier.tickets_remaining} tickets remaining for this tier."
                )
        except TicketTier.DoesNotExist:
            pass
        return attrs
