"""
USSD Handler — Nalo Solutions
────────────────────────────────────────────────────────────────
Free events:  dial → select/enter code → confirm → vote cast instantly
Paid events:  dial → enter code → enter quantity → Nalo triggers MoMo
              prompt on phone → user approves → Nalo callback → vote cast

Nalo POST fields:  USERID, MSISDN, USERDATA, MSGTYPE, SESSIONID, NETWORK
Response fields:   USERID, MSISDN, MSG, MSGTYPE (true=continue, false=end)
────────────────────────────────────────────────────────────────
"""
import json
import logging
import uuid

import requests as _requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)

SESSION_TTL = 300   # 5 minutes USSD session state
PAYMENT_TTL = 1800  # 30 minutes pending payment state

NALO_TOKEN_URL   = 'https://api.nalopay.com/clientapi/generate-payment-token/'
NALO_COLLECT_URL = 'https://api.nalopay.com/clientapi/collection/'


# ── Session helpers ───────────────────────────────────────────────────────────
def gs(sid):       return cache.get(f'nalo:{sid}', {})
def ss(sid, data): cache.set(f'nalo:{sid}', data, timeout=SESSION_TTL)
def cs(sid):       cache.delete(f'nalo:{sid}')


def cont(uid, msisdn, msg):
    return JsonResponse({"USERID": uid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": True})


def end(uid, msisdn, msg):
    return JsonResponse({"USERID": uid, "MSISDN": msisdn, "MSG": msg, "MSGTYPE": False})


def _get_nalo_token():
    """Get a short-lived Nalo API token, cached for 50 minutes."""
    cached = cache.get('nalo_api_token')
    if cached:
        return cached
    try:
        resp = _requests.post(
            NALO_TOKEN_URL,
            json={
                'client_id':     settings.NALO_CLIENT_ID,
                'client_secret': settings.NALO_CLIENT_SECRET,
            },
            timeout=10,
        )
        data = resp.json()
        token = data.get('token') or data.get('access_token') or data.get('data', {}).get('token')
        if token:
            cache.set('nalo_api_token', token, timeout=3000)
            return token
    except Exception as e:
        logger.error(f'Nalo token error: {e}')
    return None


def _trigger_momo_payment(msisdn, amount, reference, description):
    """
    Trigger a MoMo collection prompt on the user's phone via Nalo.
    Returns True if the request was accepted (payment is pending).
    """
    token = _get_nalo_token()
    if not token:
        logger.error('Nalo: could not get API token')
        return False
    try:
        payload = {
            'msisdn':      msisdn,            # voter's phone e.g. 0244123456
            'amount':      str(amount),        # GHS amount
            'reference':   reference,          # our unique ref
            'description': description,        # shows on user's phone
            'callback_url': f"{settings.BACKEND_URL.rstrip('/')}/api/v1/ussd/payment-callback/",
        }
        resp = _requests.post(
            NALO_COLLECT_URL,
            json=payload,
            headers={'Authorization': f'Bearer {token}'},
            timeout=15,
        )
        data = resp.json()
        logger.info(f'Nalo collection response: {data}')
        # Nalo returns status true/success on acceptance
        return data.get('status') in (True, 'true', 'success', 'True', 200) or resp.status_code in (200, 201, 202)
    except Exception as e:
        logger.error(f'Nalo collection error: {e}')
        return False


# ── Main USSD view ────────────────────────────────────────────────────────────
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

        # ── New session ───────────────────────────────────────────────────
        if not userdata or not state:
            cs(session_id)
            ss(session_id, {'level': 'home'})
            return cont(uid, msisdn,
                "Welcome to CelerVote\n"
                "1. Browse & Vote\n"
                "2. Quick Vote (enter code)"
            )

        level = state.get('level')

        # ── HOME ──────────────────────────────────────────────────────────
        if level == 'home':
            if userdata == '1':
                return self._show_events(uid, msisdn, session_id, state)
            elif userdata == '2':
                ss(session_id, {'level': 'quick_code'})
                return cont(uid, msisdn, "Enter the 6-character\ncandidate code:")
            return end(uid, msisdn, "Invalid choice. Dial again.")

        # ── QUICK VOTE ────────────────────────────────────────────────────
        if level == 'quick_code':
            return self._handle_quick_code(uid, msisdn, session_id, state, userdata)
        if level == 'quick_qty':
            return self._handle_quick_qty(uid, msisdn, session_id, state, userdata)
        if level == 'quick_confirm':
            return self._handle_quick_confirm(uid, msisdn, session_id, state, userdata, msisdn)

        # ── BROWSE FLOW ───────────────────────────────────────────────────
        if level == 'events':
            return self._handle_event_choice(uid, msisdn, session_id, state, userdata)
        if level == 'categories':
            return self._handle_category_choice(uid, msisdn, session_id, state, userdata)
        if level == 'candidates':
            return self._handle_candidate_choice(uid, msisdn, session_id, state, userdata)
        if level == 'browse_qty':
            return self._handle_browse_qty(uid, msisdn, session_id, state, userdata)
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
            return end(uid, msisdn, "Code conflict. Vote via:\ncelervote.com")

        event    = candidate.category.event
        category = candidate.category

        if event.status != 'active':
            return end(uid, msisdn, f"{event.title}\nVoting is not currently active.")

        state.update({
            'event_id':   str(event.id),
            'cat_id':     str(category.id),
            'cand_id':    str(candidate.id),
            'cand_name':  candidate.name,
            'cand_code':  candidate.code,
            'event_name': event.title,
            'cat_name':   category.name,
            'is_paid':    event.is_paid,
            'price':      str(event.price_per_vote) if event.is_paid else '0',
        })

        if event.is_paid:
            # Ask for quantity first
            state['level'] = 'quick_qty'
            ss(session_id, state)
            return cont(uid, msisdn,
                f"Candidate: {candidate.name}\n"
                f"Event: {event.title}\n"
                f"Price: GHS {event.price_per_vote}/vote\n\n"
                f"Enter number of votes:"
            )
        else:
            state['level'] = 'quick_confirm'
            ss(session_id, state)
            return cont(uid, msisdn,
                f"Confirm your vote:\n"
                f"Event: {event.title}\n"
                f"Category: {category.name}\n"
                f"Candidate: {candidate.name}\n\n"
                f"1. Confirm\n"
                f"2. Cancel"
            )

    def _handle_quick_qty(self, uid, msisdn, session_id, state, userdata):
        return self._handle_qty_input(uid, msisdn, session_id, state, userdata, next_level='quick_confirm')

    def _handle_quick_confirm(self, uid, msisdn, session_id, state, userdata, phone):
        if userdata == '2':
            cs(session_id)
            return end(uid, msisdn, "Vote cancelled.\nThank you.")
        if userdata != '1':
            return end(uid, msisdn, "Invalid input. Dial again.")
        return self._cast_or_pay(uid, msisdn, session_id, state, phone)

    # ── BROWSE FLOW ───────────────────────────────────────────────────────────
    def _show_events(self, uid, msisdn, session_id, state):
        from apps.events.models import Event
        events = list(Event.objects.filter(status='active').order_by('-created_at')[:5])
        if not events:
            return end(uid, msisdn, "No active events right now.\nTry again later.")

        msg  = "Select an event:\n"
        emap = {}
        for i, e in enumerate(events, 1):
            paid_tag = " [Paid]" if e.is_paid else ""
            msg += f"{i}. {e.title}{paid_tag}\n"
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

        cats = list(Category.objects.filter(event=event, is_active=True)[:5])
        if not cats:
            return end(uid, msisdn, "No categories available.")

        msg  = f"{event.title}\nSelect category:\n"
        cmap = {}
        for i, c in enumerate(cats, 1):
            msg += f"{i}. {c.name}\n"
            cmap[str(i)] = str(c.id)

        state.update({
            'level':      'categories',
            'event_id':   str(event.id),
            'event_name': event.title,
            'is_paid':    event.is_paid,
            'price':      str(event.price_per_vote) if event.is_paid else '0',
            'cmap':       cmap,
        })
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

        msg     = f"{cat.name}\nSelect candidate:\n"
        candmap = {}
        for i, cand in enumerate(cands, 1):
            code = f" [{cand.code}]" if cand.code else ""
            msg += f"{i}. {cand.name}{code}\n"
            candmap[str(i)] = str(cand.id)

        state.update({
            'level':    'candidates',
            'cat_id':   str(cat.id),
            'cat_name': cat.name,
            'candmap':  candmap,
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
            'cand_id':   str(cand.id),
            'cand_name': cand.name,
            'cand_code': cand.code or '',
        })

        if state.get('is_paid'):
            state['level'] = 'browse_qty'
            ss(session_id, state)
            price = state.get('price', '0')
            return cont(uid, msisdn,
                f"Candidate: {cand.name}\n"
                f"Price: GHS {price}/vote\n\n"
                f"Enter number of votes:"
            )
        else:
            state['level'] = 'confirm'
            ss(session_id, state)
            return cont(uid, msisdn,
                f"Confirm vote:\n{cand.name}\n"
                f"Code: #{cand.code}\n\n"
                f"1. Confirm\n2. Cancel"
            )

    def _handle_browse_qty(self, uid, msisdn, session_id, state, userdata):
        return self._handle_qty_input(uid, msisdn, session_id, state, userdata, next_level='confirm')

    def _handle_confirmation(self, uid, msisdn, session_id, state, userdata, phone):
        if userdata == '2':
            cs(session_id)
            return end(uid, msisdn, "Vote cancelled.\nThank you.")
        if userdata != '1':
            return end(uid, msisdn, "Invalid input. Dial again.")
        return self._cast_or_pay(uid, msisdn, session_id, state, phone)

    # ── Shared quantity input handler ─────────────────────────────────────────
    def _handle_qty_input(self, uid, msisdn, session_id, state, userdata, next_level):
        try:
            qty = int(userdata.strip())
            if qty < 1:
                raise ValueError
        except ValueError:
            return cont(uid, msisdn, "Invalid number.\nEnter number of votes:")

        price = float(state.get('price', 0))
        total = price * qty
        cand_name = state.get('cand_name', 'Candidate')

        state.update({
            'level':    next_level,
            'quantity': qty,
            'total':    total,
        })
        ss(session_id, state)

        return cont(uid, msisdn,
            f"Candidate: {cand_name}\n"
            f"Votes: {qty}\n"
            f"Total: GHS {total:.2f}\n\n"
            f"Payment will be charged\nto your MoMo wallet.\n\n"
            f"1. Confirm & Pay\n"
            f"2. Cancel"
        )

    # ── Cast vote (free) or trigger MoMo payment (paid) ──────────────────────
    def _cast_or_pay(self, uid, msisdn, session_id, state, phone):
        if state.get('is_paid'):
            return self._initiate_payment(uid, msisdn, session_id, state, phone)
        return self._cast_vote(uid, msisdn, session_id, state, phone)

    def _initiate_payment(self, uid, msisdn, session_id, state, phone):
        """Trigger MoMo prompt via Nalo, save pending state, end USSD session."""
        qty   = state.get('quantity', 1)
        total = state.get('total', 0)
        ref   = f'USSD-{uuid.uuid4().hex[:12].upper()}'

        # Save pending payment in cache — callback will use this to cast vote
        pending = {
            'reference':  ref,
            'msisdn':     phone,
            'event_id':   state.get('event_id'),
            'cat_id':     state.get('cat_id'),
            'cand_id':    state.get('cand_id'),
            'cand_name':  state.get('cand_name'),
            'quantity':   qty,
            'total':      total,
        }
        cache.set(f'ussd_payment:{ref}', pending, timeout=PAYMENT_TTL)

        # Also save to Payment DB record for admin visibility
        try:
            from apps.events.models import Event, Category, Candidate
            from apps.payments.models import Payment
            from apps.accounts.models import User

            clean = phone.strip().replace(' ', '')
            user, _ = User.objects.get_or_create(
                phone=clean,
                defaults={
                    'email':       f'{clean.replace("+", "")}@ussd.evoting.local',
                    'name':        clean,
                    'is_verified': True,
                }
            )
            event     = Event.objects.get(id=state['event_id'])
            Payment.objects.create(
                user=user,
                event=event,
                reference=ref,
                amount=total,
                currency=event.currency,
                votes_bought=qty,
                email=user.email,
                phone=clean,
                category_id=state.get('cat_id'),
                candidate_id=state.get('cand_id'),
            )
        except Exception as e:
            logger.warning(f'USSD payment DB record failed: {e}')

        cand_name = state.get('cand_name', 'Candidate')
        ok = _trigger_momo_payment(
            msisdn=phone,
            amount=total,
            reference=ref,
            description=f'CelerVote: {qty} vote(s) for {cand_name}',
        )

        cs(session_id)

        if ok:
            return end(uid, msisdn,
                f"Payment request sent!\n"
                f"Amount: GHS {total:.2f}\n\n"
                f"Approve the MoMo prompt\non your phone to cast\nyour {qty} vote(s).\n\n"
                f"Ref: {ref}"
            )
        else:
            cache.delete(f'ussd_payment:{ref}')
            return end(uid, msisdn,
                "Payment initiation failed.\n"
                "Please try again or\nvote via: celervote.com"
            )

    # ── Free vote caster ──────────────────────────────────────────────────────
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
                'email':       f'{clean.replace("+", "")}@ussd.evoting.local',
                'name':        clean,
                'is_verified': True,
            }
        )

        from apps.voting.services import VoteCaster
        try:
            result = VoteCaster(event, user, request=None, ip='127.0.0.1').cast_vote(
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
            return end(uid, msisdn, f"Vote recorded! ✓\n{cand_name}\nThank you for voting\non CelerVote!")
        else:
            err = result.get('error', '')
            if 'already' in err.lower():
                return end(uid, msisdn, "You already voted\nin this category.")
            return end(uid, msisdn, f"Vote failed.\n{err}\nTry again.")


# ── Nalo MoMo Payment Callback ────────────────────────────────────────────────
@method_decorator(csrf_exempt, name='dispatch')
class NaloPaymentCallbackView(View):
    """
    Nalo calls this when the user approves (or rejects) the MoMo prompt.
    We cast the vote here — this is the real safety net for USSD paid votes.
    """

    def post(self, request):
        try:
            body = json.loads(request.body)
        except Exception:
            body = request.POST.dict()

        logger.info(f'Nalo callback received: {body}')

        reference = body.get('reference') or body.get('ref') or body.get('externalRef', '')
        status    = str(body.get('status', '')).lower()

        # Nalo may use different field names — normalise
        if status in ('success', 'successful', 'completed', 'true', '1'):
            paid = True
        else:
            paid = False

        if not paid:
            logger.warning(f'Nalo callback: payment not successful for ref={reference}, status={status}')
            # Mark Payment as failed
            try:
                from apps.payments.models import Payment
                Payment.objects.filter(reference=reference).update(status=Payment.Status.FAILED)
            except Exception:
                pass
            return JsonResponse({'status': 'noted'})

        # Look up pending payment from cache
        pending = cache.get(f'ussd_payment:{reference}')
        if not pending:
            # Fall back to Payment DB record
            try:
                from apps.payments.models import Payment as PaymentModel
                pay_obj = PaymentModel.objects.get(reference=reference)
                pending = {
                    'reference': reference,
                    'event_id':  str(pay_obj.event_id),
                    'cat_id':    str(pay_obj.category_id),
                    'cand_id':   str(pay_obj.candidate_id),
                    'quantity':  pay_obj.votes_bought or 1,
                    'msisdn':    pay_obj.phone or '',
                }
            except Exception as e:
                logger.error(f'Nalo callback: no pending payment found for ref={reference}: {e}')
                return JsonResponse({'status': 'error', 'message': 'reference not found'}, status=404)

        # Mark Payment as SUCCESS
        try:
            from apps.payments.models import Payment as PaymentModel
            PaymentModel.objects.filter(reference=reference).update(
                status=PaymentModel.Status.SUCCESS,
                paystack_data=body,  # store Nalo callback data here
            )
        except Exception as e:
            logger.warning(f'Nalo callback: payment status update failed: {e}')

        # Check if already cast (idempotency)
        from apps.voting.models import Vote
        if Vote.objects.filter(payment_ref=reference).exists():
            logger.info(f'Nalo callback: vote already cast for ref={reference}')
            cache.delete(f'ussd_payment:{reference}')
            return JsonResponse({'status': 'ok', 'message': 'already cast'})

        # Cast the vote
        try:
            from apps.events.models import Event
            from apps.accounts.models import User
            from apps.voting.services import VoteCaster

            event = Event.objects.get(id=pending['event_id'])
            msisdn = pending.get('msisdn', '')
            clean  = msisdn.strip().replace(' ', '')

            user = None
            if clean:
                user, _ = User.objects.get_or_create(
                    phone=clean,
                    defaults={
                        'email':       f'{clean.replace("+", "")}@ussd.evoting.local',
                        'name':        clean,
                        'is_verified': True,
                    }
                )

            caster = VoteCaster(event=event, voter=user, request=None, ip='127.0.0.1')
            result = caster.cast_vote(
                category_id=str(pending['cat_id']),
                candidate_ids=[str(pending['cand_id'])],
                payment_ref=reference,
                quantity=int(pending.get('quantity', 1)),
            )

            if result.get('success'):
                logger.info(f'Nalo callback: vote cast successfully for ref={reference}')
                cache.delete(f'ussd_payment:{reference}')
                # Send SMS confirmation to voter
                _send_sms_confirmation(msisdn, pending.get('cand_name', 'your candidate'), pending.get('quantity', 1), reference)
            else:
                logger.error(f'Nalo callback: vote cast failed for ref={reference}: {result.get("error")}')

        except Exception as e:
            logger.error(f'Nalo callback: exception casting vote for ref={reference}: {e}')

        return JsonResponse({'status': 'ok'})

    def get(self, request):
        # Some gateways do a GET verification ping
        return JsonResponse({'status': 'ok'})


def _send_sms_confirmation(msisdn, cand_name, qty, reference):
    """Send SMS to voter after successful MoMo payment and vote cast."""
    if not msisdn:
        return
    try:
        msg = (
            f"CelerVote: Your {qty} vote(s) for {cand_name} "
            f"have been recorded! Ref: {reference}. Thank you."
        )
        # Use Nalo SMS if available, otherwise skip
        token = _get_nalo_token()
        if not token:
            return
        _requests.post(
            'https://api.nalopay.com/clientapi/sms/',  # adjust if endpoint differs
            json={'msisdn': msisdn, 'message': msg},
            headers={'Authorization': f'Bearer {token}'},
            timeout=8,
        )
    except Exception as e:
        logger.warning(f'SMS confirmation failed: {e}')
