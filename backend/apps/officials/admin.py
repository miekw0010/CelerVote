from django.contrib import admin
from .models import Official, WithdrawalRequest, OfficialOTP


@admin.register(Official)
class OfficialAdmin(admin.ModelAdmin):
    list_display  = ['name', 'phone', 'event_kind', 'event', 'ticket_event', 'revenue_percentage', 'is_active']
    list_filter   = ['event_kind', 'is_active']
    search_fields = ['name', 'phone']


@admin.register(WithdrawalRequest)
class WithdrawalRequestAdmin(admin.ModelAdmin):
    list_display  = ['official', 'amount', 'status', 'reviewed_by', 'created_at']
    list_filter   = ['status']
    search_fields = ['official__name', 'official__phone']


@admin.register(OfficialOTP)
class OfficialOTPAdmin(admin.ModelAdmin):
    list_display  = ['phone', 'is_used', 'expires_at', 'created_at']
    list_filter   = ['is_used']
