from django.urls import path
from . import views

urlpatterns = [
    path('initialize/',              views.InitializePaymentView.as_view(),    name='payment-init'),
    path('verify/<str:reference>/',  views.VerifyPaymentView.as_view(),        name='payment-verify'),
    path('status/<str:reference>/',  views.PaymentStatusView.as_view(),        name='payment-status'),
    path('webhook/nalo-checkout/',   views.NaloCheckoutWebhookView.as_view(),  name='nalo-checkout-webhook'),
    path('history/',                 views.PaymentHistoryView.as_view(),       name='payment-history'),
    path('admin/<slug:slug>/',       views.AdminPaymentListView.as_view(),     name='admin-payments'),
]
