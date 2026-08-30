from django.urls import path
from . import views

urlpatterns = [
    path('', views.PublicEventListView.as_view(), name='event-list'),
    path('admin/', views.AdminEventListCreateView.as_view(), name='admin-event-list'),
    path('admin/<slug:slug>/status/', views.AdminEventStatusView.as_view(), name='admin-event-status'),
    path('export/<slug:slug>/', views.ExportResultsView.as_view(), name='event-export'),

    # ── Organizational Election — admin ───────────────────────────────
    path('admin/<slug:slug>/groups/', views.VoterGroupListCreateView.as_view(), name='voter-groups'),
    path('admin/<slug:slug>/groups/<uuid:group_id>/', views.VoterGroupDetailView.as_view(), name='voter-group-detail'),
    path('admin/<slug:slug>/voter-roll/', views.VoterRollListView.as_view(), name='voter-roll'),
    path('admin/<slug:slug>/voter-roll/add/', views.VoterRollAddView.as_view(), name='voter-roll-add'),
    path('admin/<slug:slug>/voter-roll/upload/', views.VoterRollCSVUploadView.as_view(), name='voter-roll-upload'),
    path('admin/<slug:slug>/voter-roll/resend-all/', views.VoterRollResendAllSMSView.as_view(), name='voter-roll-resend-all'),
    path('admin/<slug:slug>/voter-roll/<uuid:voter_id>/resend/', views.VoterRollResendSMSView.as_view(), name='voter-roll-resend'),

    # ── Nominations — admin ─────────────────────────────────────────────
    path('admin/<slug:slug>/nominations/<uuid:id>/action/', views.AdminNominationActionView.as_view(), name='admin-nomination-action'),
    path('admin/<slug:slug>/nominations/<uuid:id>/', views.AdminNominationDetailView.as_view(), name='admin-nomination-detail'),
    path('admin/<slug:slug>/nominations/', views.AdminNominationListView.as_view(), name='admin-nominations'),

    path('admin/<slug:slug>/', views.AdminEventDetailView.as_view(), name='admin-event-detail'),
    path('<slug:slug>/categories/<uuid:cat_id>/candidates/<uuid:id>/', views.CandidateDetailView.as_view(), name='candidate-detail'),
    path('<slug:slug>/categories/<uuid:cat_id>/candidates/', views.CandidateListCreateView.as_view(), name='candidate-list'),
    path('<slug:slug>/categories/<uuid:id>/', views.CategoryDetailView.as_view(), name='category-detail'),
    path('<slug:slug>/categories/', views.CategoryListCreateView.as_view(), name='category-list'),

    # ── Organizational Election — public ──────────────────────────────
    path('<slug:slug>/verify-code/', views.VotingCodeVerifyView.as_view(), name='verify-code'),

    # ── Nominations — public ────────────────────────────────────────────
    path('nominate/options/', views.NominatableEventsView.as_view(), name='nominate-options'),
    path('<slug:slug>/nominate/', views.PublicNominationCreateView.as_view(), name='event-nominate'),

    path('<slug:slug>/', views.PublicEventDetailView.as_view(), name='event-detail'),
]
