from django.urls import path
from .services import EventAnalyticsView, AdminDashboardView
from . import views

urlpatterns = [
    path('dashboard/',          AdminDashboardView.as_view(),  name='analytics-dashboard'),
    path('export/<slug:slug>/', views.ExportView.as_view(),    name='analytics-export'),
    path('<slug:slug>/',        EventAnalyticsView.as_view(),  name='event-analytics'),
]