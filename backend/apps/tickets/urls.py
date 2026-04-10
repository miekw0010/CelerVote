from django.urls import path
from . import views

urlpatterns = [
    # Public
    path('',                          views.TicketEventListView.as_view(),        name='ticket-events'),
    path('<slug:slug>/',              views.TicketEventDetailView.as_view(),      name='ticket-event-detail'),

    # Purchase
    path('purchase/initiate/',        views.InitiateTicketPaymentView.as_view(),  name='ticket-initiate'),
    path('purchase/verify/',          views.VerifyTicketPaymentView.as_view(),    name='ticket-verify'),

    # My tickets
    path('my-tickets/',               views.MyTicketsView.as_view(),              name='my-tickets'),
    path('my-tickets/<str:ticket_code>/', views.TicketDetailView.as_view(),      name='ticket-detail'),

    # Admin
    path('admin/events/',             views.AdminTicketEventListView.as_view(),   name='admin-ticket-events'),
    path('admin/events/<slug:slug>/', views.AdminTicketEventDetailView.as_view(), name='admin-ticket-event-detail'),
    path('admin/events/<slug:slug>/tiers/',              views.AdminTicketTierView.as_view(), name='admin-ticket-tiers'),
    path('admin/events/<slug:slug>/tiers/<uuid:tier_id>/', views.AdminTicketTierView.as_view(), name='admin-ticket-tier-detail'),
    path('admin/events/<slug:slug>/stats/',              views.AdminTicketStatsView.as_view(), name='admin-ticket-stats'),
    path('admin/tickets/',            views.AdminAllTicketsView.as_view(),        name='admin-all-tickets'),
    path('admin/verify/',             views.AdminVerifyTicketView.as_view(),      name='admin-verify-ticket'),
    path('webhook/paystack/',         views.PaystackWebhookView.as_view(),        name='paystack-webhook'),
]
