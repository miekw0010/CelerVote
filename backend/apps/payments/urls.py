from django.urls import path
from . import views

urlpatterns = [
    path('initialize/',             views.InitializePaymentView.as_view(),  name='payment-init'),
    path('verify/<str:reference>/', views.VerifyPaymentView.as_view(),      name='payment-verify'),
    path('webhook/paystack/',       views.PaystackWebhookView.as_view(),    name='paystack-webhook'),
    path('history/',                views.PaymentHistoryView.as_view(),     name='payment-history'),
    path('admin/<slug:slug>/',      views.AdminPaymentListView.as_view(),   name='admin-payments'),
]