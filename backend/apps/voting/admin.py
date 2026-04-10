from django.contrib import admin
from .models import Vote, VoteSession, FraudFlag


@admin.register(VoteSession)
class VoteSessionAdmin(admin.ModelAdmin):
    list_display = ['voter_email', 'event', 'votes_cast', 'is_flagged', 'ip_address', 'created_at']
    list_filter  = ['is_flagged', 'event']


@admin.register(FraudFlag)
class FraudFlagAdmin(admin.ModelAdmin):
    list_display = ['fraud_type', 'event', 'resolution', 'created_at']
    list_filter  = ['fraud_type', 'resolution']


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display    = ['id', 'event', 'category', 'candidate', 'created_at']
    readonly_fields = ['id', 'session', 'event', 'category', 'candidate', 'encrypted_data', 'created_at']