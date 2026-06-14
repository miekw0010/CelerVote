from rest_framework import serializers
from .models import Vote, VoteSession, FraudFlag


class CastVoteSerializer(serializers.Serializer):
    event_slug    = serializers.SlugField()
    category_id   = serializers.UUIDField()
    candidate_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=10
    )
    payment_ref = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)  # no upper cap — paid events allow any quantity


class BulkVoteItemSerializer(serializers.Serializer):
    category_id  = serializers.UUIDField()
    candidate_id = serializers.UUIDField()


class BulkCastVoteSerializer(serializers.Serializer):
    """Used for org elections — submit all category selections in one atomic request."""
    event_slug = serializers.SlugField()
    votes      = BulkVoteItemSerializer(many=True, min_length=1, max_length=50)


class VoterActivitySerializer(serializers.ModelSerializer):
    voter_name  = serializers.SerializerMethodField()
    voter_email = serializers.SerializerMethodField()
    voter_phone = serializers.SerializerMethodField()

    class Meta:
        model  = VoteSession
        fields = [
            'id', 'voter', 'voter_name', 'voter_email', 'voter_phone',
            'ip_address', 'votes_cast', 'total_paid', 'is_flagged', 'created_at'
        ]

    def get_voter_name(self, obj):
        return obj.voter.name if obj.voter else obj.voter_name

    def get_voter_email(self, obj):
        return obj.voter.email if obj.voter else obj.voter_email

    def get_voter_phone(self, obj):
        return obj.voter.phone if obj.voter else obj.voter_phone


class FraudFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FraudFlag
        fields = ['id', 'fraud_type', 'description', 'ip_address', 'resolution', 'resolved_by', 'created_at']
        read_only_fields = fields