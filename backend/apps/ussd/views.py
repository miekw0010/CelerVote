"""
USSD Handler — Nalo Solutions
────────────────────────────────────────────────────────────────
Two ways to vote via USSD:

  QUICK VOTE  — voter dials, enters 6-char candidate code, confirms → done
  BROWSE VOTE — voter selects event → category → candidate → confirms → done

Nalo POST fields:  USERID, MSISDN, USERDATA, MSGTYPE, SESSIONID, NETWORK
Response fields:   USERID, MSISDN, MSG, MSGTYPE (true=continue, false=end)
────────────────────────────────────────────────────────────────
"""
import json
import logging

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.core.cache import cache

logger = logging.getLogger(__name__)

SESSION_TTL = 300  # 5 minutes


# ── Session helpers ───────────────────────────────────────────────────────────
def gs(sid):       return cache.get(f'nalo:{sid}', {})
def ss(sid, data): cache.set(f'nalo:{sid}', data, timeout=SESSION_TTL)
def cs(sid):       cache.delete(f'nalo:{sid}')


def cont(uid, msisdn, msg):
    return JsonResponse({"USERID": uid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": True})


def end(uid, msisdn, msg):
    return JsonResponse({"USERID": uid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": False})


# ── Main view ─────────────────────────────────────────────────────────────────
@method_decorator(csrf_exempt, name='dispatch')
class USSDView(View):

    def post(self, request):
        try:
            body = json.loads(request.body)
        except Exception:
            body = request.POST.dict()

        uid        = body.get('USERID', '')
        msisdn     = body.get('MSISDN', '')
        userdata   = body.get('USERDATA', '').strip()
        session_id = body.get('SESSIONID', '')
        network    = body.get('NETWORK', '')

        logger.info(f'NALO | sid={session_id} | msisdn={msisdn} | data={userdata!r} | net={network}')

        state = gs(session_id)

        # ── New session (no userdata = first dial) ────────────────────────
        if not userdata or not state:
            cs(session_id)
            msg = (
                "Welcome to CelerVote\n"
                "1. Browse & Vote\n"
                "2. Quick Vote (enter code)"
            )
            ss(session_id, {'level': 'home'})
            return cont(uid, msisdn, msg)

        level = state.get('level')

        # ── HOME MENU ─────────────────────────────────────────────────────
        if level == 'home':
            if userdata == '1':
                return self._show_events(uid, msisdn, session_id, state)
            elif userdata == '2':
                ss(session_id, {'level': 'quick_code'})
                return cont(uid, msisdn, "Enter the 6-character\ncandidate code:")
            else:
                return end(uid, msisdn, "Invalid choice. Dial again.")

        # ── QUICK VOTE: code entry ─────────────────────────────────────────
        if level == 'quick_code':
            return self._handle_quick_code(uid, msisdn, session_id, state, userdata)

        # ── QUICK VOTE: confirmation ───────────────────────────────────────
        if level == 'quick_confirm':
            return self._handle_quick_confirm(uid, msisdn, session_id, state, userdata, msisdn)

        # ── BROWSE FLOW ───────────────────────────────────────────────────
        if level == 'events':
            return self._handle_event_choice(uid, msisdn, session_id, state, userdata)
        if level == 'categories':
            return self._handle_category_choice(uid, msisdn, session_id, state, userdata)
        if level == 'candidates':
            return self._handle_candidate_choice(uid, msisdn, session_id, state, userdata)
        if level == 'confirm':
            return self._handle_confirmation(uid, msisdn, session_id, state, userdata, msisdn)

        return end(uid, msisdn, "Session expired. Dial again.")

    # ── QUICK VOTE: lookup candidate by code ─────────────────────────────────
    def _handle_quick_code(self, uid, msisdn, session_id, state, userdata):
        code = userdata.upper().strip()
        if len(code) != 6:
            return end(uid, msisdn, "Invalid code length.\nCodes are 6 characters.\nDial again.")

        from apps.events.models import Candidate
        try:
            candidate = Candidate.objects.select_related(
                'category__event'
            ).get(code=code, is_active=True)
        except Candidate.DoesNotExist:
            return end(uid, msisdn, f"Code {code} not found.\nCheck the code and dial again.")
        except Candidate.MultipleObjectsReturned:
            return end(uid, msisdn, "Code conflict. Please vote via the website: celervote.com")

        event    = candidate.category.event
        category = candidate.category

        if event.status != 'active':
            return end(uid, msisdn, f"{event.title}\nVoting is not currently active.")

        if event.is_paid:
            return end(uid, msisdn, f"{event.title}\nThis event requires payment.\nVote via: celervote.com")

        state.update({
            'level':      'quick_confirm',
            'event_id':   str(event.id),
            'cat_id':     str(category.id),
            'cand_id':    str(candidate.id),
            'cand_name':  candidate.name,
            'cand_code':  candidate.code,
            'event_name': event.title,
            'cat_name':   category.name,
        })
        ss(session_id, state)

        msg = (
            f"Confirm your vote:\n"
            f"Event: {event.title}\n"
            f"Category: {category.name}\n"
            f"Candidate: {candidate.name}\n"
            f"Code: #{code}\n\n"
            f"1. Confirm\n"
            f"2. Cancel"
        )
        return cont(uid, msisdn, msg)

    def _handle_quick_confirm(self, uid, msisdn, session_id, state, userdata, phone):
        if userdata == '2':
            cs(session_id)
            return end(uid, msisdn, "Vote cancelled.\nThank you.")
        if userdata != '1':
            return end(uid, msisdn, "Invalid input. Dial again.")

        return self._cast_vote(uid, msisdn, session_id, state, phone)

    # ── BROWSE FLOW ───────────────────────────────────────────────────────────
    def _show_events(self, uid, msisdn, session_id, state):
        from apps.events.models import Event
        events = list(Event.objects.filter(status='active').order_by('-created_at')[:5])
        if not events:
            return end(uid, msisdn, "No active events right now.\nTry again later.")

        msg = "Select an event:\n"
        emap = {}
        for i, e in enumerate(events, 1):
            msg += f"{i}. {e.title}\n"
            emap[str(i)] = str(e.id)

        state.update({'level': 'events', 'emap': emap})
        ss(session_id, state)
        return cont(uid, msisdn, msg.strip())

    def _handle_event_choice(self, uid, msisdn, session_id, state, userdata):
        emap = state.get('emap', {})
        if userdata not in emap:
            return end(uid, msisdn, "Invalid choice. Dial again.")

        from apps.events.models import Event, Category
        try:
            event = Event.objects.get(id=emap[userdata])
        except Event.DoesNotExist:
            return end(uid, msisdn, "Event not found.")

        if event.is_paid:
            return end(uid, msisdn, f"{event.title}\nRequires payment.\nVote via: celervote.com")

        cats = list(Category.objects.filter(event=event, is_active=True)[:5])
        if not cats:
            return end(uid, msisdn, "No categories available.")

        msg = f"{event.title}\nSelect category:\n"
        cmap = {}
        for i, c in enumerate(cats, 1):
            msg += f"{i}. {c.name}\n"
            cmap[str(i)] = str(c.id)

        state.update({'level': 'categories', 'event_id': str(event.id), 'event_name': event.title, 'cmap': cmap})
        ss(session_id, state)
        return cont(uid, msisdn, msg.strip())

    def _handle_category_choice(self, uid, msisdn, session_id, state, userdata):
        cmap = state.get('cmap', {})
        if userdata not in cmap:
            return end(uid, msisdn, "Invalid choice. Dial again.")

        from apps.events.models import Category, Candidate
        try:
            cat = Category.objects.get(id=cmap[userdata])
        except Category.DoesNotExist:
            return end(uid, msisdn, "Category not found.")

        cands = list(Candidate.objects.filter(category=cat, is_active=True)[:8])
        if not cands:
            return end(uid, msisdn, "No candidates available.")

        msg = f"{cat.name}\nSelect candidate:\n"
        candmap = {}
        for i, cand in enumerate(cands, 1):
            code = f" [{cand.code}]" if cand.code else ""
            msg += f"{i}. {cand.name}{code}\n"
            candmap[str(i)] = str(cand.id)

        state.update({
            'level': 'candidates', 'cat_id': str(cat.id),
            'cat_name': cat.name, 'candmap': candmap
        })
        ss(session_id, state)
        return cont(uid, msisdn, msg.strip())

    def _handle_candidate_choice(self, uid, msisdn, session_id, state, userdata):
        candmap = state.get('candmap', {})
        if userdata not in candmap:
            return end(uid, msisdn, "Invalid choice. Dial again.")

        from apps.events.models import Candidate
        try:
            cand = Candidate.objects.get(id=candmap[userdata])
        except Candidate.DoesNotExist:
            return end(uid, msisdn, "Candidate not found.")

        state.update({
            'level': 'confirm', 'cand_id': str(cand.id),
            'cand_name': cand.name, 'cand_code': cand.code
        })
        ss(session_id, state)

        return cont(uid, msisdn, f"Confirm vote:\n{cand.name}\nCode: #{cand.code}\n\n1. Confirm\n2. Cancel")

    def _handle_confirmation(self, uid, msisdn, session_id, state, userdata, phone):
        if userdata == '2':
            cs(session_id)
            return end(uid, msisdn, "Vote cancelled.\nThank you.")
        if userdata != '1':
            return end(uid, msisdn, "Invalid input. Dial again.")
        return self._cast_vote(uid, msisdn, session_id, state, phone)

    # ── Shared vote caster ────────────────────────────────────────────────────
    def _cast_vote(self, uid, msisdn, session_id, state, phone):
        from apps.events.models import Event, Category, Candidate

        try:
            event     = Event.objects.get(id=state.get('event_id'))
            category  = Category.objects.get(id=state.get('cat_id'))
            candidate = Candidate.objects.get(id=state.get('cand_id'))
        except Exception as e:
            logger.error(f'USSD cast_vote lookup: {e}')
            cs(session_id)
            return end(uid, msisdn, "Error processing vote.\nPlease try again.")

        from apps.accounts.models import User
        clean = phone.strip().replace(' ', '')
        user, _ = User.objects.get_or_create(
            phone=clean,
            defaults={
                'email':       f'{clean.replace("+","")}@ussd.evoting.local',
                'name':        clean,
                'is_verified': True,
            }
        )

        class FakeReq:
            META = {
                'REMOTE_ADDR': '0.0.0.0',
                'HTTP_USER_AGENT': f'USSD-Nalo/{clean}',
                'HTTP_X_FORWARDED_FOR': '',
                'HTTP_ACCEPT_LANGUAGE': '',
            }

        fake      = FakeReq()
        fake.user = user

        from apps.voting.services import VoteCaster
        try:
            result = VoteCaster(event, user, fake).cast_vote(
                category_id=str(category.id),
                candidate_ids=[str(candidate.id)],
            )
        except Exception as e:
            logger.error(f'USSD VoteCaster: {e}')
            cs(session_id)
            return end(uid, msisdn, "Error recording vote.\nPlease try again.")

        cs(session_id)
        cand_name = state.get('cand_name', 'Candidate')

        if result.get('success'):
            return end(uid, msisdn, f"Vote recorded! ✓\n{cand_name}\nThank you for voting on CelerVote!")
        else:
            err = result.get('error', '')
            if 'already' in err.lower():
                return end(uid, msisdn, "You already voted\nin this category.")
            return end(uid, msisdn, f"Vote failed.\n{err}\nTry again.")
