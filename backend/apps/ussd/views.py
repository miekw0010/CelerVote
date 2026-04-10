"""
USSD Handler — Africa's Talking
Dial: *384*XXXX# from any phone (no internet needed)

Menu Flow:
  Dial code
    → List of active events
      → List of categories
        → List of candidates
          → Confirm vote
            → Done ✅
"""
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.core.cache import cache

USSD_SESSION_TIMEOUT = 120  # seconds


def get_session_state(session_id: str) -> dict:
    return cache.get(f'ussd:{session_id}', {})


def set_session_state(session_id: str, state: dict):
    cache.set(f'ussd:{session_id}', state, timeout=USSD_SESSION_TIMEOUT)


def clear_session(session_id: str):
    cache.delete(f'ussd:{session_id}')


@method_decorator(csrf_exempt, name='dispatch')
class USSDView(View):
    """
    Africa's Talking posts to this endpoint on each USSD interaction.
    POST /ussd/
    """

    def _is_valid_request(self, request) -> bool:
        """
        Validate that the request comes from Africa's Talking.
        AT sends an API key in the header on some integrations, or we can
        validate a shared secret configured in settings.
        """
        from django.conf import settings
        expected = getattr(settings, 'AFRICASTALKING_USSD_SECRET', '')
        if not expected:
            # No secret configured — allow in dev, warn in prod
            import logging
            logging.getLogger(__name__).warning(
                'AFRICASTALKING_USSD_SECRET not set — USSD endpoint is unprotected!'
            )
            return True
        # AT can pass the secret as a query param or custom header
        provided = (
            request.GET.get('secret', '') or
            request.POST.get('secret', '') or
            request.META.get('HTTP_X_AFRICASTALKING_SECRET', '')
        )
        return provided == expected

    def post(self, request):
        if not self._is_valid_request(request):
            return HttpResponse('END Unauthorized.', content_type='text/plain')

        session_id = request.POST.get('sessionId', '')
        phone      = request.POST.get('phoneNumber', '')
        text       = request.POST.get('text', '')

        # text is cumulative e.g. "1*2*3" for each selection made
        inputs = text.strip().split('*') if text.strip() else []
        depth  = len(inputs)

        response = self.handle(session_id, phone, inputs, depth)
        return HttpResponse(response, content_type='text/plain')

    def handle(self, session_id, phone, inputs, depth):
        state = get_session_state(session_id)

        # ── Level 0: Show active events ───────────────────
        if depth == 0:
            from apps.events.models import Event
            events = Event.objects.filter(status='active').order_by('-created_at')[:5]

            if not events:
                return 'END No active voting events at this time.'

            menu      = 'CON Welcome to E-Voting\nSelect an event:\n'
            event_map = {}
            for i, event in enumerate(events, 1):
                menu += f'{i}. {event.title}\n'
                event_map[str(i)] = str(event.id)

            set_session_state(session_id, {'event_map': event_map})
            return menu.strip()

        # ── Level 1: User picked an event → show categories
        if depth == 1:
            event_map = state.get('event_map', {})
            choice    = inputs[0]

            if choice not in event_map:
                return 'END Invalid selection. Please try again.'

            from apps.events.models import Event, Category
            try:
                event = Event.objects.get(id=event_map[choice])
            except Event.DoesNotExist:
                return 'END Event not found.'

            categories = Category.objects.filter(event=event, is_active=True)[:5]
            if not categories:
                return 'END No categories available for this event.'

            menu    = f'CON {event.title}\nSelect category:\n'
            cat_map = {}
            for i, cat in enumerate(categories, 1):
                menu += f'{i}. {cat.name}\n'
                cat_map[str(i)] = str(cat.id)

            state.update({'event_id': str(event.id), 'cat_map': cat_map})
            set_session_state(session_id, state)
            return menu.strip()

        # ── Level 2: User picked a category → show candidates
        if depth == 2:
            cat_map = state.get('cat_map', {})
            choice  = inputs[1]

            if choice not in cat_map:
                return 'END Invalid selection.'

            from apps.events.models import Category, Candidate
            try:
                category = Category.objects.get(id=cat_map[choice])
            except Category.DoesNotExist:
                return 'END Category not found.'

            candidates = Candidate.objects.filter(category=category, is_active=True)[:8]
            if not candidates:
                return 'END No candidates available.'

            menu     = f'CON {category.name}\nSelect candidate:\n'
            cand_map = {}
            for i, cand in enumerate(candidates, 1):
                menu += f'{i}. {cand.name}\n'
                cand_map[str(i)] = str(cand.id)

            state.update({'cat_id': str(category.id), 'cand_map': cand_map})
            set_session_state(session_id, state)
            return menu.strip()

        # ── Level 3: User picked a candidate → confirm
        if depth == 3:
            cand_map = state.get('cand_map', {})
            choice   = inputs[2]

            if choice not in cand_map:
                return 'END Invalid selection.'

            from apps.events.models import Candidate
            try:
                candidate = Candidate.objects.get(id=cand_map[choice])
            except Candidate.DoesNotExist:
                return 'END Candidate not found.'

            state.update({'cand_id': str(candidate.id), 'cand_name': candidate.name})
            set_session_state(session_id, state)

            return (
                f'CON Confirm vote for:\n'
                f'{candidate.name}\n\n'
                f'1. Confirm\n'
                f'2. Cancel'
            )

        # ── Level 4: Final confirmation → cast vote
        if depth == 4:
            confirm = inputs[3]

            if confirm == '2':
                clear_session(session_id)
                return 'END Vote cancelled.'

            if confirm != '1':
                return 'END Invalid input.'

            event_id  = state.get('event_id')
            cat_id    = state.get('cat_id')
            cand_id   = state.get('cand_id')
            cand_name = state.get('cand_name', 'Candidate')

            from apps.events.models import Event, Category, Candidate
            try:
                event     = Event.objects.get(id=event_id)
                category  = Category.objects.get(id=cat_id)
                candidate = Candidate.objects.get(id=cand_id)
            except Exception:
                return 'END Error processing vote. Please try again.'

            # Get or create user account by phone number
            from apps.accounts.models import User
            user, _ = User.objects.get_or_create(
                phone=phone,
                defaults={
                    'email':       f'{phone.replace("+", "")}@ussd.evoting.local',
                    'name':        phone,
                    'is_verified': True,
                }
            )

            # Build a minimal fake request for VoteCaster
            class FakeRequest:
                META = {
                    'REMOTE_ADDR':           '0.0.0.0',
                    'HTTP_USER_AGENT':        f'USSD/{phone}',
                    'HTTP_X_FORWARDED_FOR':  '',
                    'HTTP_ACCEPT_LANGUAGE':  '',
                }

            fake_request      = FakeRequest()
            fake_request.user = user

            from apps.voting.services import VoteCaster
            caster = VoteCaster(event, user, fake_request)
            result = caster.cast_vote(
                category_id=str(category.id),
                candidate_ids=[str(candidate.id)],
            )

            clear_session(session_id)

            if result['success']:
                return f'END Vote recorded!\nYou voted for {cand_name}.\nThank you!'
            else:
                return f'END {result["error"]}'

        return 'END Session expired. Please dial again.'
