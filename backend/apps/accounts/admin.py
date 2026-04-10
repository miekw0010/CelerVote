from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, OTP, AdminProfile


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display  = ['email', 'name', 'role', 'is_verified', 'is_active', 'created_at']
    list_filter   = ['role', 'is_verified', 'is_active']
    search_fields = ['email', 'name', 'phone']
    ordering      = ['-created_at']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal', {'fields': ('name', 'phone', 'preferred_language')}),
        ('Status', {'fields': ('role', 'is_verified', 'is_active', 'is_staff', 'is_superuser')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'name', 'password1', 'password2', 'role')}),
    )


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ['email', 'phone', 'code', 'channel', 'is_used', 'expires_at']
    list_filter  = ['channel', 'purpose', 'is_used']


@admin.register(AdminProfile)
class AdminProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'is_approved']
    actions      = ['approve_admins']

    def approve_admins(self, request, qs):
        qs.update(is_approved=True)
    approve_admins.short_description = 'Approve selected admins'