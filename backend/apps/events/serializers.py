import re
from rest_framework import serializers
from .models import Event, Category, Candidate


def strip_html(value: str) -> str:
    return re.sub(r'<[^>]+>', '', value).strip()

def sanitize_text(value: str) -> str:
    cleaned = strip_html(value)
    return re.sub(r'\s+', ' ', cleaned)


def validate_image(value, max_mb=5):
    """Validate uploaded image: type and size."""
    if not value:
        return value
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    content_type  = getattr(value, 'content_type', '')
    if content_type and content_type not in allowed_types:
        raise serializers.ValidationError(
            f'Invalid image type: {content_type}. Only JPEG, PNG, WebP and GIF are allowed.'
        )
    max_bytes = max_mb * 1024 * 1024
    if hasattr(value, 'size') and value.size > max_bytes:
        raise serializers.ValidationError(
            f'Image too large. Maximum size is {max_mb}MB.'
        )
    return value


class CandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Candidate
        fields = [
            'id', 'name', 'description', 'photo', 'video_url',
            'order', 'is_active', 'vote_count', 'vote_percentage',
            'extra_info', 'created_at'
        ]
        read_only_fields = ['id', 'vote_count', 'vote_percentage', 'created_at']


class CandidateWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Candidate
        fields = ['name', 'description', 'photo', 'video_url', 'order', 'extra_info']

    def validate_name(self, value):
        cleaned = re.sub(r'<[^>]+>', '', value).strip()
        if len(cleaned) < 1:
            raise serializers.ValidationError('Candidate name cannot be empty.')
        return cleaned

    def validate_description(self, value):
        if value:
            return re.sub(r'<[^>]+>', '', value).strip()
        return value

    def validate_photo(self, value):
        return validate_image(value, max_mb=3)


class VoterGroupMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = __import__('apps.events.models', fromlist=['VoterGroup']).VoterGroup
        fields = ['id', 'name']


class CategorySerializer(serializers.ModelSerializer):
    candidates      = CandidateSerializer(many=True, read_only=True)
    candidate_count = serializers.SerializerMethodField()
    groups          = VoterGroupMinimalSerializer(many=True, read_only=True)

    class Meta:
        model  = Category
        fields = [
            'id', 'name', 'description', 'order', 'voting_type',
            'is_active', 'is_global', 'groups', 'candidates', 'candidate_count', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_candidate_count(self, obj):
        return obj.candidates.filter(is_active=True).count()


class CategoryWriteSerializer(serializers.ModelSerializer):
    groups = serializers.PrimaryKeyRelatedField(
        many=True, queryset=__import__('apps.events.models', fromlist=['VoterGroup']).VoterGroup.objects.all(), required=False
    )

    class Meta:
        model  = Category
        fields = ['id', 'name', 'description', 'order', 'voting_type', 'is_active', 'is_global', 'groups']
        read_only_fields = ['id']

    def create(self, validated_data):
        groups = validated_data.pop('groups', [])
        category = super().create(validated_data)
        # A group-specific category should only belong to ONE group.
        # If multiple groups passed, the view handles creating one category per group.
        if groups:
            category.groups.set(groups[:1])  # only first group
        return category

    def update(self, instance, validated_data):
        groups = validated_data.pop('groups', None)
        instance = super().update(instance, validated_data)
        if groups is not None:
            # On edit, replace with the single group selected
            instance.groups.set(groups[:1] if groups else [])
        return instance


class EventListSerializer(serializers.ModelSerializer):
    organizer_name = serializers.CharField(source='organizer.name', read_only=True)
    category_count = serializers.SerializerMethodField()

    class Meta:
        model  = Event
        fields = [
            'id', 'slug', 'title', 'description', 'event_type',
            'voting_type', 'voting_mode', 'status', 'organizer_name',
            'is_paid', 'price_per_vote', 'currency',
            'start_time', 'end_time', 'banner_image', 'thumbnail',
            'theme_color', 'total_votes', 'category_count',
            'show_live_results', 'results_published', 'hide_vote_counts', 'created_at'
        ]

    def get_category_count(self, obj):
        return obj.categories.filter(is_active=True).count()


class EventDetailSerializer(serializers.ModelSerializer):
    organizer_name = serializers.CharField(source='organizer.name', read_only=True)
    categories     = CategorySerializer(many=True, read_only=True)
    is_open        = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Event
        fields = [
            'id', 'slug', 'title', 'description', 'event_type',
            'voting_type', 'status', 'is_open',
            'organizer_name', 'organizer',
            'allow_multiple_votes', 'max_votes_per_user', 'max_choices_per_vote',
            'require_auth', 'start_time', 'end_time',
            'banner_image', 'thumbnail', 'theme_color', 'theme_config',
            'is_paid', 'price_per_vote', 'currency',
            'show_live_results', 'results_visible', 'results_published', 'hide_vote_counts',
            'languages', 'total_votes', 'categories', 'created_at',
            'voting_mode', 'show_group_results',
        ]
        read_only_fields = ['id', 'total_votes', 'created_at']


class EventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Event
        fields = [
            'title', 'slug', 'description', 'event_type', 'voting_type',
            'voting_mode', 'show_group_results',
            'allow_multiple_votes', 'max_votes_per_user', 'max_choices_per_vote',
            'require_auth', 'start_time', 'end_time',
            'banner_image', 'thumbnail', 'theme_color', 'theme_config',
            'is_paid', 'price_per_vote', 'currency',
            'show_live_results', 'results_visible', 'results_published', 'hide_vote_counts', 'languages'
        ]

    def validate_slug(self, value):
        return value.lower().strip().replace(' ', '-')

    def validate_title(self, value):
        cleaned = sanitize_text(value)
        if len(cleaned) < 3:
            raise serializers.ValidationError('Title must be at least 3 characters.')
        return cleaned

    def validate_description(self, value):
        if value:
            return sanitize_text(value)
        return value

    def validate_price_per_vote(self, value):
        if value and float(value) < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        if value and float(value) > 10000:
            raise serializers.ValidationError('Price per vote cannot exceed 10,000.')
        return value

    def validate_banner_image(self, value):
        return validate_image(value, max_mb=5)

    def validate_thumbnail(self, value):
        return validate_image(value, max_mb=2)

    def validate(self, data):
        if data.get('start_time') and data.get('end_time'):
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError('End time must be after start time.')
        if data.get('event_type') in ['survey'] and data.get('is_paid'):
            raise serializers.ValidationError(
                'Survey/Poll events cannot have pay-per-vote enabled.'
            )
        return data

    def create(self, validated_data):
        validated_data['organizer'] = self.context['request'].user
        return super().create(validated_data)


class EventUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Event
        fields = [
            'title', 'description', 'status',
            'voting_mode', 'show_group_results',
            'allow_multiple_votes', 'max_votes_per_user', 'max_choices_per_vote',
            'start_time', 'end_time', 'banner_image', 'thumbnail',
            'theme_color', 'theme_config', 'is_paid', 'price_per_vote',
            'show_live_results', 'results_visible', 'results_published', 'hide_vote_counts', 'languages'
        ]

    def validate_title(self, value):
        cleaned = sanitize_text(value)
        if len(cleaned) < 3:
            raise serializers.ValidationError('Title must be at least 3 characters.')
        return cleaned

    def validate_description(self, value):
        if value:
            return sanitize_text(value)
        return value