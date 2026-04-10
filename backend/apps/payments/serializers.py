from rest_framework import serializers
from .models import Payment


class InitializePaymentSerializer(serializers.Serializer):
    event_slug   = serializers.SlugField()
    votes_count  = serializers.IntegerField(min_value=1, max_value=100, default=1)
    email        = serializers.EmailField(required=False, allow_blank=True)
    phone        = serializers.CharField(max_length=30, required=False, allow_blank=True)
    category_id  = serializers.UUIDField(required=False)
    candidate_id = serializers.UUIDField(required=False)
    callback_url = serializers.URLField(required=False, allow_blank=True)


class PaymentSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True)

    class Meta:
        model  = Payment
        fields = [
            'id', 'reference', 'amount', 'currency', 'channel',
            'status', 'votes_bought', 'email', 'event_title', 'created_at'
        ]
        read_only_fields = fields