"""
Nomination review services — shared between the admin portal (apps.events)
and the official portal (apps.officials) so both go through identical logic.
"""
import logging
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def list_nominations(event, status=None):
    from .models import Nomination
    qs = Nomination.objects.filter(event=event).select_related('category', 'candidate')
    if status:
        qs = qs.filter(status=status)
    return qs


def update_nomination(nomination, data):
    """
    Edit nominee info prior to (or instead of) approval.
    Allowed fields: full_name, stage_name, phone, reason, category_id (reassign), photo.
    Only applies to nominations still pending.
    """
    from .models import Category

    if nomination.status != nomination.Status.PENDING:
        raise ValueError('Only pending nominations can be edited.')

    if 'full_name' in data and data['full_name']:
        nomination.full_name = data['full_name'].strip()
    if 'stage_name' in data and data['stage_name']:
        nomination.stage_name = data['stage_name'].strip()
    if 'phone' in data and data['phone']:
        nomination.phone = data['phone'].strip()
    if 'reason' in data:
        nomination.reason = (data.get('reason') or '').strip()
    if data.get('category_id'):
        category = Category.objects.filter(id=data['category_id'], event=nomination.event).first()
        if not category:
            raise ValueError('Selected category does not belong to this event.')
        nomination.category = category
    if data.get('photo') is not None:
        nomination.photo = data['photo']

    nomination.save()
    return nomination


def send_nomination_received_sms(nomination):
    """
    Sent immediately after a self-nomination is submitted — confirms receipt
    and sets expectations while it's under review.
    """
    try:
        from apps.notifications.tasks import send_sms
        if not nomination.phone:
            return
        send_sms(
            nomination.phone,
            (
                f'CelerVote: Thanks {nomination.stage_name}! Your nomination for '
                f'{nomination.event.title} ({nomination.category.name}) has been received '
                f'and is pending review. We will text you an update once it has been reviewed.'
            ),
        )
    except Exception as e:
        logger.warning(f'Failed to send nomination received SMS to {nomination.phone}: {e}')


def _send_contestant_sms(candidate):
    try:
        from apps.notifications.tasks import send_sms
        if not candidate.phone:
            return
        event_link = f'https://celervote.com/events/{candidate.category.event.slug}'
        send_sms(
            candidate.phone,
            (
                f'CelerVote: Congratulations {candidate.name}! Your nomination for '
                f'{candidate.category.event.title} ({candidate.category.name}) has been '
                f'approved. Your contestant code is {candidate.code}. View the event and '
                f'ask your fans to vote for you at {event_link}'
            ),
        )
    except Exception as e:
        logger.warning(f'Failed to send contestant approval SMS to {candidate.phone}: {e}')


@transaction.atomic
def approve_nomination(nomination, reviewer_admin=None, reviewer_official=None):
    from .models import Candidate

    if nomination.status != nomination.Status.PENDING:
        raise ValueError('This nomination has already been reviewed.')

    candidate = Candidate.objects.create(
        category=nomination.category,
        name=nomination.stage_name,
        full_name=nomination.full_name,
        phone=nomination.phone,
        photo=nomination.photo,
        description=nomination.reason,
    )

    nomination.status        = nomination.Status.APPROVED
    nomination.candidate     = candidate
    nomination.reviewed_by_admin    = reviewer_admin
    nomination.reviewed_by_official = reviewer_official
    nomination.reviewed_at   = timezone.now()
    nomination.save()

    _send_contestant_sms(candidate)

    return nomination, candidate


def reject_nomination(nomination, reviewer_admin=None, reviewer_official=None, reason=''):
    if nomination.status != nomination.Status.PENDING:
        raise ValueError('This nomination has already been reviewed.')

    nomination.status           = nomination.Status.REJECTED
    nomination.rejection_reason = (reason or '').strip()
    nomination.reviewed_by_admin    = reviewer_admin
    nomination.reviewed_by_official = reviewer_official
    nomination.reviewed_at      = timezone.now()
    nomination.save()
    return nomination
