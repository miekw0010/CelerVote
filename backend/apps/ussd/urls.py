from django.urls import path
from .views import USSDView, NaloPaymentCallbackView

urlpatterns = [
    path('',                  USSDView.as_view(),               name='ussd'),
    path('payment-callback/', NaloPaymentCallbackView.as_view(), name='ussd-payment-callback'),
]
