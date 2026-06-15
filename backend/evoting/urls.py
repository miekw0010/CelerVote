from django.contrib import admin
from decouple import config
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import IsAdminUser




urlpatterns = [
    path(config('ADMIN_URL', default='cv-admin/'), admin.site.urls),
    path('api/v1/auth/',          include('apps.accounts.urls')),
    path('api/v1/events/',        include('apps.events.urls')),
    path('api/v1/voting/',        include('apps.voting.urls')),
    path('api/v1/payments/',      include('apps.payments.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/analytics/',     include('apps.analytics.urls')),
    path('ussd/',                 include('apps.ussd.urls')),
    path('api/v1/ussd/',                 include('apps.ussd.urls')),
    path('api/v1/tickets/',       include('apps.tickets.urls')),
    path('api/v1/officials/',     include('apps.officials.urls')),

]

# API docs — only available in DEBUG mode, and only to admin users
if settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(permission_classes=[IsAdminUser]), name='schema'),
        path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema', permission_classes=[IsAdminUser]), name='docs'),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
