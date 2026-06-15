from django.urls import path
from .views import USSDView, NaloPaymentCallbackView, CheckPaymentStatusView

urlpatterns = [
    path('', USSDView.as_view(), name='ussd'),
    path('payment-callback/', NaloPaymentCallbackView.as_view(), name='ussd-payment-callback'),
    path('check-payment/<str:reference>/', CheckPaymentStatusView.as_view(), name='check-payment'),
]