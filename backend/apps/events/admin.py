from django import forms
from django.contrib import admin
from .models import Event, Category, Candidate


class EventAdminForm(forms.ModelForm):
    class Meta:
        model   = Event
        exclude = []

    def clean_languages(self):
        value = self.cleaned_data.get('languages')
        if not value:
            return ['en']
        return value


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    form          = EventAdminForm
    list_display  = ['title', 'slug', 'status', 'event_type', 'organizer', 'total_votes', 'is_paid', 'created_at']
    list_filter   = ['status', 'event_type', 'voting_type', 'is_paid']
    search_fields = ['title', 'slug']
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields     = ['total_votes', 'created_at', 'updated_at']
    fieldsets = (
        ('Basic Info', {
            'fields': ('title', 'slug', 'description', 'event_type', 'voting_type', 'status', 'organizer')
        }),
        ('Voting Settings', {
            'fields': ('allow_multiple_votes', 'max_votes_per_user', 'max_choices_per_vote', 'require_auth')
        }),
        ('Schedule', {
            'fields': ('start_time', 'end_time')
        }),
        ('Payment', {
            'fields': ('is_paid', 'price_per_vote', 'currency')
        }),
        ('Media', {
            'fields': ('banner_image', 'thumbnail', 'theme_color')
        }),
        ('Results', {
            'fields': ('show_live_results', 'results_visible', 'total_votes')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display  = ['name', 'event', 'voting_type', 'is_active', 'order']
    list_filter   = ['is_active', 'voting_type']
    search_fields = ['name', 'event__title']


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display  = ['name', 'category', 'vote_count', 'vote_percentage', 'is_active']
    list_filter   = ['is_active', 'category__event']
    search_fields = ['name', 'category__name']