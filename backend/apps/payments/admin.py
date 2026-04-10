from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display    = ['reference', 'email', 'event', 'amount', 'currency', 'status', 'created_at']
    list_filter     = ['status', 'currency']
    search_fields   = ['reference', 'email']
    readonly_fields = ['reference', 'paystack_id', 'paystack_data']