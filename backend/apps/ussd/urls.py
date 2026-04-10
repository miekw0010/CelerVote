from django.urls import path
from .views import USSDView

urlpatterns = [
    path('', USSDView.as_view(), name='ussd'),
]
