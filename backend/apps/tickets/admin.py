from django.contrib import admin
from .models import TicketEvent, TicketTier, Ticket


class TicketTierInline(admin.TabularInline):
    model  = TicketTier
    extra  = 1
    fields = ['name', 'price', 'quantity', 'color', 'order', 'is_active']


@admin.register(TicketEvent)
class TicketEventAdmin(admin.ModelAdmin):
    list_display   = ['title', 'venue', 'event_date', 'is_active', 'is_published', 'total_tickets_sold', 'created_at']
    list_filter    = ['is_active', 'is_published']
    search_fields  = ['title', 'venue']
    prepopulated_fields = {'slug': ('title',)}
    inlines        = [TicketTierInline]
    readonly_fields = ['total_tickets_sold', 'total_revenue']


@admin.register(TicketTier)
class TicketTierAdmin(admin.ModelAdmin):
    list_display  = ['name', 'event', 'price', 'quantity', 'tickets_sold', 'tickets_remaining', 'is_active']
    list_filter   = ['is_active', 'event']
    search_fields = ['name', 'event__title']
    readonly_fields = ['tickets_sold', 'tickets_remaining']


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display  = ['ticket_code', 'buyer_name', 'buyer_email', 'tier', 'status', 'total_amount', 'created_at']
    list_filter   = ['status', 'tier__event']
    search_fields = ['ticket_code', 'buyer_name', 'buyer_email', 'paystack_ref']
    readonly_fields = ['ticket_code', 'qr_code', 'paystack_ref', 'created_at', 'paid_at']
