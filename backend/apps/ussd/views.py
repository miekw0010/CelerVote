"""
USSD Handler — Nalo Solutions
Dial your shortcode from any phone (no internet needed)

Nalo sends JSON POST requests with:
  USERID    — Nalo-assigned user ID
  MSISDN    — caller's phone number e.g. 233XXXXXXXXX
  USERDATA  — what the user typed (empty string on first dial)
  MSGTYPE   — true = new/first session, false = continuing session
  SESSIONID — unique session ID
  NETWORK   — MTN, Vodafone, AirtelTigo etc.

We respond with JSON:
  USERID    — same as received
  MSISDN    — same as received
  MSG       — message to display on phone (max 182 chars per screen)
  MSGTYPE   — true = continue session (show menu), false = end session

Menu Flow:
  Dial code → List events → List categories → List candidates → Confirm → Done
"""
import json
import logging

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.core.cache import cache

logger = logging.getLogger(__name__)

USSD_SESSION_TIMEOUT = 300  # seconds — 5 min, real phone sessions take longer


def get_session(session_id: str) -> dict:
    return cache.get(f'ussd_nalo:{session_id}', {})


def set_session(session_id: str, state: dict):
    cache.set(f'ussd_nalo:{session_id}', state, timeout=USSD_SESSION_TIMEOUT)


def clear_session(session_id: str):
    cache.delete(f'ussd_nalo:{session_id}')


def nalo_continue(userid, msisdn, msg):
    """Keep the USSD session open."""
    return JsonResponse({"USERID": userid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": True})


def nalo_end(userid, msisdn, msg):
    """Terminate the USSD session."""
    return JsonResponse({"USERID": userid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": False})


@method_decorator(csrf_exempt, name='dispatch')
class USSDView(View):

    def post(self, request):
        try:
            body = json.loads(request.body)
        except Exception:
            body = request.POST.dict()

        userid     = body.get('USERID', '')
        msisdn     = body.get('MSISDN', '')
        userdata   = body.get('USERDATA', '').strip()
        msgtype    = body.get('MSGTYPE', True)
        session_id = body.get('SESSIONID', '')
        network    = body.get('NETWORK', '')

        logger.info(f'USSD Nalo | session={session_id} | msisdn={msisdn} | userdata={userdata!r} | msgtype={msgtype} | network={network}')

        # Treat as new session only when USERDATA is empty
        # Do NOT rely on MSGTYPE — some providers send true on every request
        state = get_session(session_id)

        if not userdata or not state:
            clear_session(session_id)
            return self._show_events(userid, msisdn, session_id)

        level = state.get('level', 0)

        if level == 0:
            return self._handle_event_choice(userid, msisdn, session_id, state, userdata)
        elif level == 1:
            return self._handle_category_choice(userid, msisdn, session_id, state, userdata)
        elif level == 2:
            return self._handle_candidate_choice(userid, msisdn, session_id, state, userdata)
        elif level == 3:
            return self._handle_confirmation(userid, msisdn, session_id, state, userdata, msisdn)

        return nalo_end(userid, msisdn, 'Session expired. Please dial again.')

    def _show_events(self, userid, msisdn, session_id):
        from apps.events.models import Event
        events = list(Event.objects.filter(status='active').order_by('-created_at')[:5])
        if not events:
            return nalo_end(userid, msisdn, 'No active voting events at this time.')

        msg = 'Welcome to CelerVote\nSelect an event:\n'
        event_map = {}
        for i, e in enumerate(events, 1):
            msg += f'{i}. {e.title}\n'
            event_map[str(i)] = str(e.id)

        set_session(session_id, {'level': 0, 'event_map': event_map})
        return nalo_continue(userid, msisdn, msg.strip())

    def _handle_event_choice(self, userid, msisdn, session_id, state, userdata):
        event_map = state.get('event_map', {})
        if userdata not in event_map:
            return nalo_end(userid, msisdn, 'Invalid selection. Please dial again.')

        from apps.events.models import Event, Category
        try:
            event = Event.objects.get(id=event_map[userdata])
        except Event.DoesNotExist:
            return nalo_end(userid, msisdn, 'Event not found.')

        if event.is_paid:
            return nalo_end(userid, msisdn, f'{event.title}\nThis event requires payment.\nVote via celervote.com')

        categories = list(Category.objects.filter(event=event, is_active=True)[:5])
        if not categories:
            return nalo_end(userid, msisdn, 'No categories available.')

        msg = f'{event.title}\nSelect category:\n'
        cat_map = {}
        for i, c in enumerate(categories, 1):
            msg += f'{i}. {c.name}\n'
            cat_map[str(i)] = str(c.id)

        state.update({'level': 1, 'event_id': str(event.id), 'cat_map': cat_map})
        set_session(session_id, state)
        return nalo_continue(userid, msisdn, msg.strip())

    def _handle_category_choice(self, userid, msisdn, session_id, state, userdata):
        cat_map = state.get('cat_map', {})
        if userdata not in cat_map:
            return nalo_end(userid, msisdn, 'Invalid selection. Please dial again.')

        from apps.events.models import Category, Candidate
        try:
            category = Category.objects.get(id=cat_map[userdata])
        except Category.DoesNotExist:
            return nalo_end(userid, msisdn, 'Category not found.')

        candidates = list(Candidate.objects.filter(category=category, is_active=True)[:8])
        if not candidates:
            return nalo_end(userid, msisdn, 'No candidates available.')

        msg = f'{category.name}\nSelect candidate:\n'
        cand_map = {}
        for i, cand in enumerate(candidates, 1):
            code = f' [{cand.code}]' if getattr(cand, 'code', '') else ''
            msg += f'{i}. {cand.name}{code}\n'
            cand_map[str(i)] = str(cand.id)

        state.update({'level': 2, 'cat_id': str(category.id), 'cand_map': cand_map})
        set_session(session_id, state)
        return nalo_continue(userid, msisdn, msg.strip())

    def _handle_candidate_choice(self, userid, msisdn, session_id, state, userdata):
        cand_map = state.get('cand_map', {})
        if userdata not in cand_map:
            return nalo_end(userid, msisdn, 'Invalid selection. Please dial again.')

        from apps.events.models import Candidate
        try:
            candidate = Candidate.objects.get(id=cand_map[userdata])
        except Candidate.DoesNotExist:
            return nalo_end(userid, msisdn, 'Candidate not found.')

        state.update({'level': 3, 'cand_id': str(candidate.id), 'cand_name': candidate.name})
        set_session(session_id, state)

        msg = f'Confirm your vote:\n{candidate.name}\n\n1. Confirm\n2. Cancel'
        return nalo_continue(userid, msisdn, msg)

    def _handle_confirmation(self, userid, msisdn, session_id, state, userdata, phone):
        if userdata == '2':
            clear_session(session_id)
            return nalo_end(userid, msisdn, 'Vote cancelled. Thank you.')

        if userdata != '1':
            return nalo_end(userid, msisdn, 'Invalid input. Please dial again.')

        from apps.events.models import Event, Category, Candidate
        try:
            event     = Event.objects.get(id=state.get('event_id'))
            category  = Category.objects.get(id=state.get('cat_id'))
            candidate = Candidate.objects.get(id=state.get('cand_id'))
        except Exception as e:
            logger.error(f'USSD vote lookup error: {e}')
            clear_session(session_id)
            return nalo_end(userid, msisdn, 'Error processing vote. Please try again.')

        from apps.accounts.models import User
        clean_phone = phone.strip().replace(' ', '')
        user, _ = User.objects.get_or_create(
            phone=clean_phone,
            defaults={
                'email':       f'{clean_phone.replace("+", "")}@ussd.evoting.local',
                'name':        clean_phone,
                'is_verified': True,
            }
        )

        class FakeRequest:
            META = {
                'REMOTE_ADDR':          '0.0.0.0',
                'HTTP_USER_AGENT':      f'USSD-Nalo/{clean_phone}',
                'HTTP_X_FORWARDED_FOR': '',
                'HTTP_ACCEPT_LANGUAGE': '',
            }

        fake_request      = FakeRequest()
        fake_request.user = user

        from apps.voting.services import VoteCaster
        try:
            caster = VoteCaster(event, user, fake_request)
            result = caster.cast_vote(
                category_id=str(category.id),
                candidate_ids=[str(candidate.id)],
            )
        except Exception as e:
            logger.error(f'USSD VoteCaster error: {e}')
            clear_session(session_id)
            return nalo_end(userid, msisdn, 'Error recording vote. Please try again.')

        clear_session(session_id)
        cand_name = state.get('cand_name', 'Candidate')

        if result.get('success'):
            return nalo_end(userid, msisdn, f'Vote recorded!\nYou voted for {cand_name}.\nThank you for voting!')
        else:
            error = result.get('error', 'Unknown error')
            if 'already' in error.lower():
                return nalo_end(userid, msisdn, 'You have already voted in this category.')
            return nalo_end(userid, msisdn, f'Vote failed: {error}')
