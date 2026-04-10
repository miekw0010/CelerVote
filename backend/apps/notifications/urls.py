from django.urls import path
from . import views

urlpatterns = [
    path('publish-results/<slug:slug>/', views.PublishResultsView.as_view(),    name='publish-results'),
    path('remind/<slug:slug>/',          views.SendReminderView.as_view(),       name='send-reminder'),
    path('custom/<slug:slug>/',          views.SendCustomMessageView.as_view(),  name='send-custom'),
]