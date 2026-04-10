from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('otp/request/',        views.RequestOTPView.as_view(),    name='otp-request'),
    path('otp/verify/',         views.VerifyOTPView.as_view(),     name='otp-verify'),
    path('admin/register/',     views.AdminRegisterView.as_view(), name='admin-register'),
    path('admin/login/',        views.AdminLoginView.as_view(),    name='admin-login'),
    path('token/refresh/',      TokenRefreshView.as_view(),        name='token-refresh'),
    path('logout/',             views.LogoutView.as_view(),        name='logout'),
    path('profile/',            views.ProfileView.as_view(),       name='profile'),
    path('voters/',              views.VoterListView.as_view(),   name='voter-list'),
    path('voters/<uuid:voter_id>/', views.VoterDetailView.as_view(), name='voter-detail'),
    path('change-password/', views.ChangePasswordView.as_view(), name='change-password'),
    path('check-user/',      views.CheckUserView.as_view(),      name='check-user'),
]