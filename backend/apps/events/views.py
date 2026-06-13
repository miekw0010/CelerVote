from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
import django_filters

from .models import Event, Category, Candidate
from .serializers import (
    EventListSerializer, EventListPublicSerializer,
    EventDetailSerializer, EventDetailPublicSerializer,
    EventCreateSerializer, EventUpdateSerializer,
    CategorySerializer, CategoryWriteSerializer,
    CandidateSerializer, CandidateWriteSerializer
)


def auto_expire_events(queryset):
    """Auto-end events whose end_time has passed. Auto-reactivate if end_time extended to future."""
    from django.utils import timezone
    now = timezone.now()

    # Mark active events as ended if end_time has passed
    queryset.filter(
        status=Event.Status.ACTIVE,
        end_time__isnull=False,
        end_time__lt=now
    ).update(status=Event.Status.ENDED)

    # Reactivate ended events if end_time has been extended to the future
    queryset.filter(
        status=Event.Status.ENDED,
        end_time__isnull=False,
        end_time__gt=now
    ).update(status=Event.Status.ACTIVE)

    return queryset


class EventFilter(django_filters.FilterSet):
    status     = django_filters.CharFilter(field_name='status')
    event_type = django_filters.CharFilter(field_name='event_type')
    is_paid    = django_filters.BooleanFilter(field_name='is_paid')

    class Meta:
        model  = Event
        fields = ['status', 'event_type', 'is_paid']


class PublicEventListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = EventFilter
    search_fields      = ['title', 'description']
    ordering_fields    = ['created_at', 'start_time', 'total_votes']
    ordering           = ['-created_at']
    serializer_class   = EventListPublicSerializer  # safe public version

    def get_queryset(self):
        qs = Event.objects.filter(
            status__in=[Event.Status.ACTIVE, Event.Status.ENDED, Event.Status.SCHEDULED]
        ).select_related('organizer').prefetch_related('categories')
        auto_expire_events(qs)
        return qs


class PublicEventDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    lookup_field       = 'slug'
    serializer_class   = EventDetailPublicSerializer  # safe public version

    def get_queryset(self):
        qs = Event.objects.filter(
            status__in=[Event.Status.ACTIVE, Event.Status.ENDED, Event.Status.SCHEDULED]
        ).select_related('organizer').prefetch_related('categories__candidates')
        auto_expire_events(qs)
        return qs


class AdminEventListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        return EventCreateSerializer if self.request.method == 'POST' else EventListSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'superadmin':
            qs = Event.objects.all().select_related('organizer').prefetch_related('categories__candidates')
        else:
            qs = Event.objects.filter(organizer=user).select_related('organizer').prefetch_related('categories__candidates')
        auto_expire_events(qs)
        return qs

    def perform_create(self, serializer):
        serializer.save(organizer=self.request.user)


class AdminEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    lookup_field       = 'slug'
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        return EventUpdateSerializer if self.request.method in ['PUT', 'PATCH'] else EventDetailSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'superadmin':
            return Event.objects.all()
        return Event.objects.filter(organizer=user)


class AdminEventStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        new_status = request.data.get('status')
        valid = [s[0] for s in Event.Status.choices]
        if new_status not in valid:
            return Response({'error': f'Invalid status. Choose from: {valid}'}, status=400)

        event.status = new_status
        event.save(update_fields=['status'])
        return Response({'message': f'Status updated to {new_status}', 'status': new_status})


class CategoryListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly]
    pagination_class   = None  # Return ALL categories — never paginate

    def get_serializer_class(self):
        return CategoryWriteSerializer if self.request.method == 'POST' else CategorySerializer

    def get_event(self):
        return get_object_or_404(Event, slug=self.kwargs['slug'])

    def get_queryset(self):
        return Category.objects.filter(event=self.get_event()).prefetch_related('candidates', 'groups')

    def perform_create(self, serializer):
        event = self.get_event()
        if event.organizer != self.request.user and self.request.user.role != 'superadmin':
            raise PermissionError('You do not own this event')
        serializer.save(event=event)

    def create(self, request, *args, **kwargs):
        """
        If multiple groups are selected for a group-specific category,
        create ONE separate category per group (each independent with own candidates/votes).
        If is_global or 0-1 groups selected, create normally.
        """
        from .models import VoterGroup
        event     = self.get_event()
        is_global = request.data.get('is_global', True)
        group_ids = request.data.get('groups', [])

        # Convert string 'true'/'false' from FormData
        if isinstance(is_global, str):
            is_global = is_global.lower() == 'true'

        # Global or single group — normal create
        if is_global or len(group_ids) <= 1:
            return super().create(request, *args, **kwargs)

        # Multiple groups — create one category per group
        created = []
        for gid in group_ids:
            group = VoterGroup.objects.filter(id=gid, event=event).first()
            if not group:
                continue
            data = {**request.data, 'is_global': False, 'groups': [gid]}
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            cat = serializer.save(event=event)
            created.append(CategorySerializer(cat).data)

        from rest_framework import status as drf_status
        return Response(created, status=drf_status.HTTP_201_CREATED)


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    lookup_field       = 'id'

    def get_serializer_class(self):
        return CategoryWriteSerializer if self.request.method in ['PUT', 'PATCH'] else CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(event__slug=self.kwargs['slug'])


class CandidateListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
    pagination_class   = None  # Return ALL candidates — never paginate

    def get_serializer_class(self):
        return CandidateWriteSerializer if self.request.method == 'POST' else CandidateSerializer

    def get_category(self):
        return get_object_or_404(Category, id=self.kwargs['cat_id'], event__slug=self.kwargs['slug'])

    def get_queryset(self):
        return Candidate.objects.filter(category=self.get_category())

    def perform_create(self, serializer):
        category = self.get_category()
        if category.event.organizer != self.request.user and self.request.user.role != 'superadmin':
            raise PermissionError('You do not own this event')
        serializer.save(category=category)


class CandidateDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    lookup_field       = 'id'
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        return CandidateWriteSerializer if self.request.method in ['PUT', 'PATCH'] else CandidateSerializer

    def get_queryset(self):
        return Candidate.objects.filter(category__id=self.kwargs['cat_id'])


class ExportResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        try:
            event = Event.objects.get(slug=slug)
        except Event.DoesNotExist:
            return Response({'error': f'Event "{slug}" not found'}, status=404)

        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        export_format = request.query_params.get('format', 'csv')

        if export_format == 'csv':
            from apps.analytics.services import export_results_csv
            return export_results_csv(event)
        elif export_format == 'pdf':
            from apps.analytics.services import export_results_pdf
            return export_results_pdf(event)
        else:
            return Response({'error': 'Invalid format. Use csv or pdf'}, status=400)


# ── Voter Roll Views ──────────────────────────────────────────────────────────

class VoterRollVerifyView(APIView):
    """Public endpoint — voter enters their ID to get a one-time voting token."""
    permission_classes  = [AllowAny]
    authentication_classes = []

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)

        if event.voting_mode != 'closed_roll':
            return Response({'error': 'This event does not use voter roll verification.'}, status=400)

        if not event.is_open:
            return Response({'error': 'Voting is not currently open for this event.'}, status=400)

        import re as _re
        voter_id = request.data.get('voter_id', '').strip().upper()
        voter_id = _re.sub(r'[^A-Z0-9\-_/]', '', voter_id)[:50]  # sanitize + cap length
        if not voter_id:
            return Response({'error': 'Voter ID is required.'}, status=400)

        from .models import VoterRoll
        try:
            roll_entry = VoterRoll.objects.get(event=event, voter_id=voter_id)
        except VoterRoll.DoesNotExist:
            return Response({'error': 'Voter ID not found. Please check your ID and try again.'}, status=404)

        if roll_entry.has_voted:
            return Response({'error': 'This voter ID has already been used to vote.'}, status=400)

        # Auto-create or find a user account for this roll entry
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.utils import timezone as tz

        User = get_user_model()

        # Build a unique internal email for this voter
        safe_id    = voter_id.lower().replace(' ', '_')
        safe_slug  = slug.replace('-', '_')
        email      = f'roll_{safe_id}_{safe_slug}@voterroll.evoting.local'

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'name':        roll_entry.name or voter_id,
                'phone':       roll_entry.phone or None,
                'is_verified': True,
            }
        )

        # Issue a short-lived JWT (30 minutes — enough to vote, not enough to abuse)
        refresh = RefreshToken.for_user(user)
        refresh.set_exp(lifetime=__import__('datetime').timedelta(minutes=30))
        refresh['voter_roll_id'] = str(roll_entry.id)
        refresh['name']  = user.name
        refresh['role']  = user.role
        refresh['email'] = user.email

        return Response({
            'status':     'verified',
            'voter_name': roll_entry.name or voter_id,
            'voter_id':   voter_id,
            'tokens': {
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            },
        })


class AdminVoterRollView(APIView):
    """List voter roll entries for an event, with stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)

        from .models import VoterRoll
        entries = VoterRoll.objects.filter(event=event)
        total   = entries.count()
        voted   = entries.filter(has_voted=True).count()

        data = [{
            'id':        str(e.id),
            'voter_id':  e.voter_id,
            'name':      e.name,
            'email':     e.email,
            'phone':     e.phone,
            'has_voted': e.has_voted,
            'voted_at':  e.voted_at,
        } for e in entries]

        return Response({
            'total':   total,
            'voted':   voted,
            'pending': total - voted,
            'entries': data,
        })

    def delete(self, request, slug):
        """Clear the entire voter roll for this event."""
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterRoll
        deleted, _ = VoterRoll.objects.filter(event=event).delete()
        return Response({'message': f'Deleted {deleted} voter roll entries.'})


class AdminVoterRollUploadView(APIView):
    """Upload a CSV file to populate the voter roll."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)

        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'error': 'CSV file is required.'}, status=400)

        if not csv_file.name.endswith('.csv'):
            return Response({'error': 'File must be a .csv file.'}, status=400)

        if csv_file.size > 5 * 1024 * 1024:  # 5MB limit
            return Response({'error': 'File too large. Maximum 5MB.'}, status=400)

        import csv, io
        from .models import VoterRoll
        from django.db import IntegrityError

        try:
            text     = csv_file.read().decode('utf-8-sig')  # handles BOM
            reader   = csv.DictReader(io.StringIO(text))
            headers  = [h.strip().lower() for h in (reader.fieldnames or [])]
        except Exception as e:
            return Response({'error': f'Could not read CSV: {str(e)}'}, status=400)

        # Accept flexible column names
        id_col    = next((h for h in headers if h in ['id', 'voter_id', 'student_id', 'staff_id', 'index', 'index_number']), None)
        name_col  = next((h for h in headers if h in ['name', 'full_name', 'fullname', 'student_name']), None)
        email_col = next((h for h in headers if 'email' in h), None)
        phone_col = next((h for h in headers if 'phone' in h or 'tel' in h or 'mobile' in h), None)

        if not id_col:
            return Response({
                'error': 'CSV must have a column named: id, voter_id, student_id, staff_id, index, or index_number.'
            }, status=400)

        created_count = 0
        skipped_count = 0
        errors        = []

        for i, row in enumerate(reader, start=2):
            raw_row    = {k.strip().lower(): v.strip() for k, v in row.items()}
            voter_id   = raw_row.get(id_col, '').strip().upper()
            if not voter_id:
                continue

            try:
                VoterRoll.objects.get_or_create(
                    event=event,
                    voter_id=voter_id,
                    defaults={
                        'name':  raw_row.get(name_col, '') if name_col else '',
                        'email': raw_row.get(email_col, '') if email_col else '',
                        'phone': raw_row.get(phone_col, '') if phone_col else '',
                    }
                )
                created_count += 1
            except IntegrityError:
                skipped_count += 1
            except Exception as e:
                errors.append(f'Row {i}: {str(e)}')

        return Response({
            'message':  f'Upload complete. {created_count} added, {skipped_count} skipped (duplicates).',
            'created':  created_count,
            'skipped':  skipped_count,
            'errors':   errors[:10],  # cap at 10 error messages
        })


# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATIONAL ELECTIONS — Voter Groups, Voter Roll, Code Verification
# ══════════════════════════════════════════════════════════════════════════════

class VoterGroupListCreateView(APIView):
    """Admin: list and create voter groups for an event."""
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterGroup
        groups = VoterGroup.objects.filter(event=event).annotate(
            voter_count=__import__('django').db.models.Count('voters'),
        )
        data = [{
            'id': str(g.id), 'name': g.name, 'description': g.description,
            'voter_count': g.voter_count, 'created_at': g.created_at,
        } for g in groups]
        return Response(data)

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'Group name is required.'}, status=400)
        from .models import VoterGroup
        group, created = VoterGroup.objects.get_or_create(
            event=event, name=name,
            defaults={'description': request.data.get('description', '')}
        )
        if not created:
            return Response({'error': f'Group "{name}" already exists.'}, status=400)
        return Response({'id': str(group.id), 'name': group.name, 'description': group.description, 'voter_count': 0}, status=201)


class VoterGroupDetailView(APIView):
    """Admin: update or delete a voter group."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, slug, group_id):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterGroup
        group = get_object_or_404(VoterGroup, id=group_id, event=event)
        if 'name' in request.data:
            group.name = request.data['name'].strip()
        if 'description' in request.data:
            group.description = request.data['description']
        group.save()
        return Response({'id': str(group.id), 'name': group.name, 'description': group.description})

    def delete(self, request, slug, group_id):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterGroup, Category
        group = get_object_or_404(VoterGroup, id=group_id, event=event)

        # Delete all categories that belong ONLY to this group (group-specific, not global).
        # Categories assigned to multiple groups should NOT be deleted — but since our
        # design now enforces one group per category, any non-global category in this
        # group is exclusively owned by it.
        orphaned = Category.objects.filter(
            event=event,
            is_global=False,
            groups=group,
        )
        cat_count = orphaned.count()
        orphaned.delete()

        group.delete()
        return Response({
            'message': f'Group deleted. {cat_count} category/ies belonging exclusively to this group were also removed.'
        })


class VoterRollListView(APIView):
    """Admin: list all voters in roll with stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterRoll
        voters = VoterRoll.objects.filter(event=event).select_related('group')
        group_filter = request.query_params.get('group')
        if group_filter:
            voters = voters.filter(group__id=group_filter)
        total  = voters.count()
        used   = voters.filter(status='used').count()
        data   = [{
            'id':          str(v.id),
            'voter_id':    v.voter_id,
            'name':        v.name,
            'phone':       v.phone,
            'email':       v.email,
            'voting_code': v.voting_code,
            'status':      v.status,
            'sms_sent':    v.sms_sent,
            'group':       {'id': str(v.group.id), 'name': v.group.name} if v.group else None,
            'used_at':     v.used_at,
            'created_at':  v.created_at,
        } for v in voters]
        return Response({'total': total, 'used': used, 'unused': total - used, 'voters': data})

    def delete(self, request, slug):
        """Clear entire voter roll."""
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterRoll
        deleted, _ = VoterRoll.objects.filter(event=event).delete()
        return Response({'message': f'Deleted {deleted} voters.'})


class VoterRollAddView(APIView):
    """Admin: manually add a single voter."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)

        voter_id = request.data.get('voter_id', '').strip().upper()
        name     = request.data.get('name', '').strip()
        phone    = request.data.get('phone', '').strip()
        email    = request.data.get('email', '').strip()
        group_id = request.data.get('group_id', '').strip()

        if not voter_id:
            return Response({'error': 'voter_id is required.'}, status=400)

        from .models import VoterRoll, VoterGroup
        group = None
        if group_id:
            group = get_object_or_404(VoterGroup, id=group_id, event=event)

        if VoterRoll.objects.filter(event=event, voter_id=voter_id).exists():
            return Response({'error': f'Voter ID "{voter_id}" already exists in this election.'}, status=400)

        voter = VoterRoll.objects.create(
            event=event, group=group,
            voter_id=voter_id, name=name, phone=phone, email=email,
        )

        # Send SMS if phone provided
        if phone:
            _send_voting_code_sms(voter)

        return Response({
            'id':          str(voter.id),
            'voter_id':    voter.voter_id,
            'name':        voter.name,
            'voting_code': voter.voting_code,
            'sms_sent':    voter.sms_sent,
        }, status=201)


class VoterRollVoterDetailView(APIView):
    """Admin: resend SMS or delete a single voter from the roll."""
    permission_classes = [IsAuthenticated]

    def _get_voter(self, request, slug, voter_id):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return None, None, Response({'error': 'Permission denied.'}, status=403)
        from .models import VoterRoll
        voter = get_object_or_404(VoterRoll, id=voter_id, event=event)
        return event, voter, None

    def post(self, request, slug, voter_id):
        """Resend SMS.""",
        _, voter, err = self._get_voter(request, slug, voter_id)
        if err: return err
        if not voter.phone:
            return Response({'error': 'No phone number on file for this voter.'}, status=400)
        _send_voting_code_sms(voter)
        return Response({'message': f'SMS resent to {voter.phone}', 'sms_sent': voter.sms_sent})

    def delete(self, request, slug, voter_id):
        """Delete a single voter from the roll.""",
        _, voter, err = self._get_voter(request, slug, voter_id)
        if err: return err
        if voter.status == 'used':
            return Response({'error': 'Cannot delete a voter who has already voted.'}, status=400)
        voter_id_label = voter.voter_id
        voter.delete()
        return Response({'message': f'Voter {voter_id_label} removed from the roll.'})


# Keep old name as alias for backwards compat
VoterRollResendSMSView = VoterRollVoterDetailView


class VoterRollCSVUploadView(APIView):
    """Admin: bulk upload voters via CSV."""
    permission_classes = [IsAuthenticated]
    parser_classes     = [__import__('rest_framework.parsers', fromlist=['MultiPartParser']).MultiPartParser,
                          __import__('rest_framework.parsers', fromlist=['FormParser']).FormParser]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied.'}, status=403)

        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'error': 'CSV file is required.'}, status=400)
        if not csv_file.name.endswith('.csv'):
            return Response({'error': 'File must be a .csv'}, status=400)
        if csv_file.size > 5 * 1024 * 1024:
            return Response({'error': 'Max file size is 5MB.'}, status=400)

        # Read + validate headers synchronously (fast), then hand off to Celery
        try:
            text = csv_file.read().decode('utf-8-sig')
        except Exception as e:
            return Response({'error': f'Could not read file: {e}'}, status=400)

        import csv, io
        try:
            reader  = csv.DictReader(io.StringIO(text))
            headers = [h.strip().lower() for h in (reader.fieldnames or [])]
        except Exception as e:
            return Response({'error': f'Invalid CSV format: {e}'}, status=400)

        id_col = next((h for h in headers if h in ['id','voter_id','student_id','staff_id','index','index_number']), None)
        if not id_col:
            return Response({'error': 'CSV needs a column: id, voter_id, student_id, staff_id, index, or index_number.'}, status=400)

        send_sms_raw  = request.POST.get('send_sms', request.data.get('send_sms', 'true'))
        send_sms_flag = str(send_sms_raw).lower() == 'true'

        # Dispatch to Celery — returns 202 immediately so the request doesn't block
        try:
            from apps.events.tasks import process_voter_roll_csv
            task = process_voter_roll_csv.delay(str(event.id), text, send_sms_flag)
            return Response({
                'status':  'processing',
                'task_id': task.id,
                'message': 'Upload received. Processing in the background — refresh the voter list in a few seconds.',
            }, status=202)
        except Exception:
            # Celery not running — fall back to synchronous (blocking) processing
            from apps.events.tasks import process_voter_roll_csv
            result = process_voter_roll_csv(str(event.id), text, send_sms_flag)
            return Response(result or {'status': 'done', 'message': 'Upload complete.'})


class VotingCodeVerifyView(APIView):
    """
    Public: voter enters their 6-char code.
    Returns a short-lived JWT + their filtered ballot (categories they can see).
    """
    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)

        if event.voting_mode != 'organizational':
            return Response({'error': 'This event does not use voting codes.'}, status=400)

        if not event.is_open:
            return Response({'error': 'Voting is not currently open.'}, status=400)

        code = request.data.get('code', '').strip().upper()
        if not code:
            return Response({'error': 'Voting code is required.'}, status=400)

        from .models import VoterRoll
        try:
            voter = VoterRoll.objects.select_related('group').get(event=event, voting_code=code)
        except VoterRoll.DoesNotExist:
            return Response({'error': 'Invalid voting code. Please check and try again.'}, status=404)

        if voter.status == 'used':
            return Response({'error': 'This code has already been used to vote.'}, status=400)

        # Auto-create / find internal user account
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken
        import datetime

        User = get_user_model()
        safe_code = code.lower()
        safe_slug = slug.replace('-', '_')
        email = f'org_{safe_code}_{safe_slug}@org.evoting.local'

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                'name':        voter.name or code,
                'phone':       voter.phone or None,
                'is_verified': True,
            }
        )

        # Issue 2-hour JWT with voter roll info embedded
        refresh = RefreshToken.for_user(user)
        refresh.set_exp(lifetime=datetime.timedelta(hours=2))
        refresh['voter_roll_id'] = str(voter.id)
        refresh['voter_name']    = voter.name or voter.voter_id
        refresh['group_id']      = str(voter.group.id) if voter.group else ''
        refresh['group_name']    = voter.group.name if voter.group else ''
        refresh['name']          = user.name
        refresh['role']          = user.role
        refresh['email']         = user.email

        # Build filtered ballot — categories this voter can see
        from .serializers import CategorySerializer
        has_groups = event.voter_groups.exists()
        all_cats   = event.categories.filter(is_active=True).prefetch_related('candidates', 'groups')

        if not has_groups:
            # No groups configured — show all categories
            visible_cats = list(all_cats)
        else:
            visible_cats = [c for c in all_cats if c.is_visible_to_voter(voter)]

        return Response({
            'status':      'verified',
            'voter_name':  voter.name or voter.voter_id,
            'voter_id':    voter.voter_id,
            'group':       {'id': str(voter.group.id), 'name': voter.group.name} if voter.group else None,
            'ballot':      CategorySerializer(visible_cats, many=True).data,
            'tokens': {
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            },
        })


# ── Helpers ───────────────────────────────────────────────────────────────────

def _send_voting_code_sms(voter):
    """Send voting code via SMS and update sms_sent flag."""
    if not voter.phone:
        return
    try:
        from apps.notifications.tasks import send_sms
        message = (
            f"Your voting code for {voter.event.title} is: {voter.voting_code}\n"
            f"Enter this code on the voting page to cast your vote."
        )
        send_sms(voter.phone, message)
        voter.sms_sent = True
        voter.save(update_fields=['sms_sent'])
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'SMS failed for voter {voter.voter_id}: {e}')
