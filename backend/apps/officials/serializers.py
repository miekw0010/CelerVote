from rest_framework import serializers
from .models import Official, WithdrawalRequest, OfficialOTP


class OfficialSerializer(serializers.ModelSerializer):
    event_title       = serializers.SerializerMethodField()
    event_slug        = serializers.SerializerMethodField()
    current_balance   = serializers.SerializerMethodField()
    total_earned      = serializers.SerializerMethodField()
    total_withdrawn   = serializers.SerializerMethodField()

    class Meta:
        model  = Official
        fields = [
            'id', 'name', 'phone', 'event_kind', 'event', 'ticket_event',
            'event_title', 'event_slug', 'revenue_percentage',
            'current_balance', 'total_earned', 'total_withdrawn',
            'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_event_title(self, obj):
        if obj.event:
            return obj.event.title
        if obj.ticket_event:
            return obj.ticket_event.title
        return ''

    def get_event_slug(self, obj):
        if obj.event:
            return obj.event.slug
        if obj.ticket_event:
            return obj.ticket_event.slug
        return ''

    def get_current_balance(self, obj):
        return obj.current_balance

    def get_total_earned(self, obj):
        return obj.total_earned

    def get_total_withdrawn(self, obj):
        return obj.total_withdrawn


class OfficialCreateSerializer(serializers.ModelSerializer):
    """Admin uses this when assigning officials to an event."""
    class Meta:
        model  = Official
        fields = ['name', 'phone', 'event_kind', 'event', 'ticket_event', 'revenue_percentage']

    def validate(self, data):
        if not data.get('event') and not data.get('ticket_event'):
            raise serializers.ValidationError('Must specify either event or ticket_event.')
        if data.get('event') and data.get('ticket_event'):
            raise serializers.ValidationError('Cannot specify both event and ticket_event.')
        return data


class WithdrawalRequestSerializer(serializers.ModelSerializer):
    official_name    = serializers.CharField(source='official.name', read_only=True)
    official_phone   = serializers.CharField(source='official.phone', read_only=True)
    official_balance = serializers.SerializerMethodField()
    event_title      = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = WithdrawalRequest
        fields = [
            'id', 'official', 'official_name', 'official_phone', 'official_balance',
            'event_title', 'amount', 'note', 'status', 'admin_note',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'created_at',
        ]
        read_only_fields = ['id', 'official', 'status', 'reviewed_by', 'reviewed_at', 'created_at']

    def get_official_balance(self, obj):
        return obj.official.current_balance

    def get_event_title(self, obj):
        if obj.official.event:
            return obj.official.event.title
        if obj.official.ticket_event:
            return obj.official.ticket_event.title
        return ''

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.name if obj.reviewed_by else None


class WithdrawalCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    note   = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_amount(self, value):
        official = self.context.get('official')
        if official and float(value) > official.current_balance:
            raise serializers.ValidationError(
                f'Amount exceeds current balance of {official.current_balance}.'
            )
        return value
