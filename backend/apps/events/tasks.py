from celery import shared_task
import csv, io, logging
logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, name='events.process_voter_roll_csv')
def process_voter_roll_csv(self, event_id: str, csv_text: str, send_sms: bool = True):
    """
    Process voter roll CSV in the background.
    Returns a summary dict stored in cache for the frontend to poll.
    """
    from django.core.cache import cache
    from apps.events.models import Event, VoterRoll, VoterGroup

    task_key = f'csv_upload:{event_id}:{self.request.id}'
    cache.set(task_key, {'status': 'processing', 'created': 0, 'skipped': 0, 'errors': []}, timeout=600)

    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        cache.set(task_key, {'status': 'error', 'message': 'Event not found.'}, timeout=600)
        return

    reader  = csv.DictReader(io.StringIO(csv_text))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]

    id_col    = next((h for h in headers if h in ['id','voter_id','student_id','staff_id','index','index_number']), None)
    name_col  = next((h for h in headers if h in ['name','full_name','fullname','student_name']), None)
    phone_col = next((h for h in headers if 'phone' in h or 'tel' in h or 'mobile' in h), None)
    email_col = next((h for h in headers if 'email' in h), None)
    group_col = next((h for h in headers if h in ['group','group_name','department','level','class']), None)

    if not id_col:
        cache.set(task_key, {
            'status': 'error',
            'message': 'CSV needs a column: id, voter_id, student_id, staff_id, index, or index_number.'
        }, timeout=600)
        return

    group_cache = {}
    def get_or_create_group(name):
        name = name.strip()
        if not name:
            return None
        if name not in group_cache:
            g, _ = VoterGroup.objects.get_or_create(event=event, name=name)
            group_cache[name] = g
        return group_cache[name]

    created_count = 0
    skipped_count = 0
    sms_count     = 0
    errors        = []

    for i, row in enumerate(reader, start=2):
        raw      = {k.strip().lower(): v.strip() for k, v in row.items()}
        voter_id = raw.get(id_col, '').strip().upper()
        if not voter_id:
            continue

        name     = raw.get(name_col,  '') if name_col  else ''
        phone    = raw.get(phone_col, '') if phone_col else ''
        email    = raw.get(email_col, '') if email_col else ''
        grp_name = raw.get(group_col, '') if group_col else ''
        group    = get_or_create_group(grp_name) if grp_name else None

        if VoterRoll.objects.filter(event=event, voter_id=voter_id).exists():
            skipped_count += 1
            continue

        try:
            voter = VoterRoll.objects.create(
                event=event, group=group,
                voter_id=voter_id, name=name, phone=phone, email=email,
            )
            created_count += 1
            if send_sms and phone:
                try:
                    from apps.events.views import _send_voting_code_sms
                    _send_voting_code_sms(voter)
                    sms_count += 1
                except Exception as sms_err:
                    logger.warning(f'SMS failed for {voter_id}: {sms_err}')
        except Exception as e:
            errors.append(f'Row {i}: {e}')

    result = {
        'status':   'done',
        'message':  f'{created_count} voters added, {skipped_count} skipped, {sms_count} SMS sent.',
        'created':  created_count,
        'skipped':  skipped_count,
        'sms_sent': sms_count,
        'errors':   errors[:10],
    }
    cache.set(task_key, result, timeout=600)
    logger.info(f'CSV upload complete for event {event_id}: {result["message"]}')
    return result
