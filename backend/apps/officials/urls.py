from django.urls import path
from . import views

urlpatterns = [
    # ── Official auth ─────────────────────────────────────────────────────────
    path('auth/request-otp/',  views.OfficialRequestOTPView.as_view(),  name='official-request-otp'),
    path('auth/verify-otp/',   views.OfficialVerifyOTPView.as_view(),   name='official-verify-otp'),

    # ── Official dashboard & actions ──────────────────────────────────────────
    path('dashboard/',         views.OfficialDashboardView.as_view(),   name='official-dashboard'),
    path('tickets/',           views.OfficialTicketListView.as_view(),  name='official-tickets'),
    path('check-in/',          views.OfficialCheckInView.as_view(),     name='official-check-in'),
    path('voter-roll/',        views.OfficialVoterRollView.as_view(),   name='official-voter-roll'),
    path('voter-roll/add/',    views.OfficialAddVoterView.as_view(),    name='official-add-voter'),
    path('voter-roll/upload/', views.OfficialVoterRollCSVUploadView.as_view(), name='official-voter-roll-upload'),
    path('voter-roll/resend-all/', views.OfficialResendAllVoterSMSView.as_view(), name='official-voter-roll-resend-all'),
    path('voter-roll/<uuid:voter_id>/resend/', views.OfficialResendVoterSMSView.as_view(), name='official-voter-roll-resend'),
    path('withdrawals/',       views.OfficialWithdrawalView.as_view(),  name='official-withdrawals'),

    # ── Official: Nominations ─────────────────────────────────────────────────
    path('nominations/toggle/',           views.OfficialNominationsToggleView.as_view(), name='official-nominations-toggle'),
    path('nominations/<uuid:id>/action/', views.OfficialNominationActionView.as_view(), name='official-nomination-action'),
    path('nominations/<uuid:id>/',        views.OfficialNominationDetailView.as_view(), name='official-nomination-detail'),
    path('nominations/',                  views.OfficialNominationListView.as_view(),   name='official-nominations'),

    # ── Admin management (specific paths before uuid pattern) ─────────────────
    path('admin/withdrawals/<uuid:pk>/review/', views.AdminWithdrawalReviewView.as_view(),  name='admin-withdrawal-review'),
    path('admin/withdrawals/',                  views.AdminWithdrawalListView.as_view(),     name='admin-withdrawals'),
    path('admin/<uuid:pk>/',                    views.AdminOfficialDetailView.as_view(),     name='admin-official-detail'),
    path('admin/',                              views.AdminOfficialListCreateView.as_view(), name='admin-officials'),
]

