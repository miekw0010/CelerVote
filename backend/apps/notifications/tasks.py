"""
Notifications Service
- Email via Django SMTP
- SMS & OTP via Arkesel
- All sent asynchronously via Celery tasks
"""
import logging
from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Brand Colors ─────────────────────────────────────────────────────────────
BRAND_TEAL    = "#14b8a6"
BRAND_DARK    = "#0f172a"
BRAND_GRAY    = "#64748b"
BRAND_LIGHT   = "#f8fafc"
BRAND_NAME    = "CelerVote"
BRAND_TAGLINE = "Secure Electronic Voting"

# ── Email Base Template ───────────────────────────────────────────────────────
def base_email(content: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;background:{BRAND_TEAL};border-radius:10px;display:inline-block;text-align:center;line-height:40px;">
                  <span style="color:white;font-weight:900;font-size:16px;">CV</span>
                </div>
                <span style="color:white;font-size:22px;font-weight:700;margin-left:10px;">{BRAND_NAME}</span>
              </div>
              <p style="color:#94a3b8;font-size:12px;margin:8px 0 0;">{BRAND_TAGLINE}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              {content}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">
                &copy; 2026 {BRAND_NAME} &mdash; {BRAND_TAGLINE}<br/>
                <span style="font-size:11px;">If you did not request this email, please ignore it.</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

# ── Core Senders ──────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, text_body: str, html_body: str = None):
    try:
        import requests as _requests
        api_key = settings.EMAIL_HOST_PASSWORD
        response = _requests.post(
            'https://api.resend.com/emails',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'from':    settings.DEFAULT_FROM_EMAIL,
                'to':      [to],
                'subject': subject,
                'text':    text_body,
                'html':    html_body or text_body,
            },
            timeout=30,
        )
        logger.error(f'Resend response: {response.status_code} — {response.text}')
        response.raise_for_status()
        logger.info(f'Email sent to {to}: {subject}')
    except Exception as e:
        logger.error(f'Failed to send email to {to}: {e}')
        raise


def send_sms(phone: str, message: str):
    """Send a plain SMS via Arkesel SMS API."""
    try:
        import requests as _requests
        url = 'https://sms.arkesel.com/sms/api'
        params = {
            'action':  'send-sms',
            'api_key': settings.ARKESEL_API_KEY,
            'to':      phone,
            'from':    settings.ARKESEL_SENDER_ID,
            'sms':     message,
        }
        response = _requests.get(url, params=params, timeout=15)
        data     = response.json()
        if data.get('code') != 'ok':
            raise Exception(f"Arkesel SMS error: {data}")
        logger.info(f'SMS sent to {phone} via Arkesel: {data}')
        return data
    except Exception as e:
        logger.error(f'Failed to send SMS to {phone}: {e}')
        raise


def arkesel_generate_otp(phone: str) -> dict:
    """Generate and send OTP via Arkesel OTP API."""
    import requests as _requests
    response = _requests.post(
        'https://sms.arkesel.com/api/otp/generate',
        headers={'api-key': settings.ARKESEL_OTP_API_KEY},
        json={
            'expiry':    settings.OTP_EXPIRY_MINUTES,
            'length':    6,
            'medium':    'sms',
            'message':   f'Your CelerVote verification code is %otp_code%. Valid for %expiry% minutes. Do not share.',
            'number':    phone,
            'sender_id': settings.ARKESEL_SENDER_ID,
            'type':      'numeric',
        },
        timeout=15,
    )
    data = response.json()
    if data.get('code') != '1000':
        raise Exception(f"Arkesel OTP generate error: {data}")
    logger.info(f'Arkesel OTP sent to {phone}: {data}')
    return data


def arkesel_verify_otp(phone: str, code: str) -> bool:
    """Verify OTP code via Arkesel OTP API."""
    import requests as _requests
    response = _requests.post(
        'https://sms.arkesel.com/api/otp/verify',
        headers={'api-key': settings.ARKESEL_OTP_API_KEY},
        json={'code': code, 'number': phone},
        timeout=15,
    )
    data = response.json()
    logger.info(f'Arkesel OTP verify for {phone}: {data}')
    return data.get('code') == '1100'


# ── Celery Tasks ──────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_otp_email_task(self, email: str, code: str, purpose: str = 'login'):
    purposes = {
        'login':    'Your Login Code',
        'register': 'Verify Your Email',
        'verify':   'Email Verification',
    }
    subject = purposes.get(purpose, 'Your OTP Code')
    text    = f'Your {BRAND_NAME} verification code is: {code}. Valid for {settings.OTP_EXPIRY_MINUTES} minutes.'

    content = f"""
      <h2 style="color:{BRAND_DARK};font-size:24px;font-weight:700;margin:0 0 8px;">
        Verification Code
      </h2>
      <p style="color:{BRAND_GRAY};font-size:15px;margin:0 0 32px;">
        Use the code below to complete your sign-in to {BRAND_NAME}.
      </p>
      <div style="background:linear-gradient(135deg,{BRAND_DARK} 0%,#1e293b 100%);border-radius:12px;padding:32px;text-align:center;margin:0 0 24px;">
        <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">One-Time Password</p>
        <div style="letter-spacing:12px;font-size:40px;font-weight:900;color:{BRAND_TEAL};font-family:'Courier New',monospace;">
          {code}
        </div>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px;">
        <p style="color:#92400e;font-size:13px;margin:0;">
          &#9201; This code expires in <strong>{settings.OTP_EXPIRY_MINUTES} minutes</strong>. Do not share it with anyone.
        </p>
      </div>
      <p style="color:{BRAND_GRAY};font-size:13px;margin:0;">
        If you did not try to sign in, you can safely ignore this email.
      </p>
    """

    try:
        send_email(email, f'{BRAND_NAME} — {subject}', text, base_email(content))
    except Exception as exc:
        logger.error(f'OTP email failed for {email}: {exc}')
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            try:
                from django.core.mail import get_connection
                connection = get_connection(
                    backend='django.core.mail.backends.smtp.EmailBackend',
                    host=settings.EMAIL_HOST,
                    port=settings.EMAIL_PORT,
                    username=settings.EMAIL_HOST_USER,
                    password=settings.EMAIL_HOST_PASSWORD,
                    use_tls=settings.EMAIL_USE_TLS,
                    use_ssl=getattr(settings, 'EMAIL_USE_SSL', False),
                    timeout=30,
                    fail_silently=False,
                )
                msg = EmailMultiAlternatives(
                    subject=f'{BRAND_NAME} — {subject}',
                    body=text,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[email],
                    connection=connection,
                )
                msg.attach_alternative(base_email(content), 'text/html')
                msg.send()
                logger.info(f'OTP email sent via direct connection to {email}')
            except Exception as e2:
                logger.error(f'Direct connection also failed for {email}: {e2}')


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_otp_sms_task(self, phone: str, code: str):
    """Send OTP via Arkesel OTP API — Arkesel generates and sends the code itself."""
    try:
        arkesel_generate_otp(phone)
    except Exception as exc:
        logger.error(f'Arkesel OTP failed for {phone}: {exc}')
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_vote_confirmation_sms_task(self, phone: str, event_title: str, candidate_name: str):
    try:
        message = f'{BRAND_NAME}: Your vote for {candidate_name} in {event_title} has been recorded. Thank you!'
        send_sms(phone, message)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_results_published_sms_task(self, phone: str, event_title: str, event_slug: str):
    try:
        message = f'{BRAND_NAME}: Results for {event_title} are now live! Visit celervote.com/results/{event_slug} to see who won.'
        send_sms(phone, message)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_event_alert_sms_task(self, phone: str, event_title: str, message_body: str):
    try:
        message = f'{BRAND_NAME} - {event_title}: {message_body}'
        send_sms(phone, message)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_vote_confirmation_task(self, email: str, event_title: str, candidate_name: str):
    try:
        subject = f'Vote Confirmed - {event_title}'
        text    = f'Your vote for {candidate_name} in {event_title} has been recorded.'

        content = f"""
          <h2 style="color:{BRAND_DARK};font-size:24px;font-weight:700;margin:0 0 8px;">
            Vote Confirmed! &#10003;
          </h2>
          <p style="color:{BRAND_GRAY};font-size:15px;margin:0 0 24px;">
            Your vote has been securely recorded.
          </p>
          <div style="background:{BRAND_LIGHT};border-radius:12px;padding:24px;margin:0 0 24px;border:1px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:{BRAND_GRAY};font-size:13px;padding:6px 0;">Event</td>
                <td style="color:{BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">{event_title}</td>
              </tr>
              <tr>
                <td style="color:{BRAND_GRAY};font-size:13px;padding:6px 0;">Your Vote</td>
                <td style="color:{BRAND_TEAL};font-size:13px;font-weight:700;text-align:right;">{candidate_name}</td>
              </tr>
              <tr>
                <td style="color:{BRAND_GRAY};font-size:13px;padding:6px 0;">Status</td>
                <td style="text-align:right;">
                  <span style="background:#dcfce7;color:#166534;font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;">
                    Recorded
                  </span>
                </td>
              </tr>
            </table>
          </div>
          <p style="color:{BRAND_GRAY};font-size:13px;margin:0;">
            Your vote is encrypted and tamper-proof. Thank you for participating!
          </p>
        """

        send_email(email, f'{BRAND_NAME} — {subject}', text, base_email(content))
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def notify_event_results_task(self, event_id: str):
    """Notify all voters when results are published."""
    try:
        from apps.events.models import Event
        from apps.voting.models import VoteSession

        event    = Event.objects.get(id=event_id)
        sessions = VoteSession.objects.filter(event=event)
        subject  = f'Results are out - {event.title}'

        for session in sessions:
            email = None
            if session.voter:
                email = session.voter.email
            elif session.voter_email:
                email = session.voter_email

            if email and not email.endswith('@phone.evoting.local'):
                text    = f'The results for {event.title} are now available. Visit {BRAND_NAME} to see who won!'
                content = f"""
                  <h2 style="color:{BRAND_DARK};font-size:24px;font-weight:700;margin:0 0 8px;">
                    Results Are In! &#127942;
                  </h2>
                  <p style="color:{BRAND_GRAY};font-size:15px;margin:0 0 24px;">
                    The results for <strong style="color:{BRAND_DARK};">{event.title}</strong> are now live!
                  </p>
                  <div style="text-align:center;margin:32px 0;">
                    <a href="https://celervote.com/results/{event.slug}"
                       style="background:{BRAND_TEAL};color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                      View Results
                    </a>
                  </div>
                  <p style="color:{BRAND_GRAY};font-size:13px;margin:0;">
                    Thank you for participating in this event.
                  </p>
                """
                send_email(email, f'{BRAND_NAME} — {subject}', text, base_email(content))

            phone = None
            if session.voter and session.voter.phone:
                phone = session.voter.phone
            elif session.voter_phone:
                phone = session.voter_phone
            if phone:
                send_results_published_sms_task.delay(phone, event.title, event.slug)

    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_event_reminder_task(self, event_id: str):
    """Remind voters about an upcoming event deadline."""
    try:
        from apps.events.models import Event
        from apps.voting.models import VoteSession

        event    = Event.objects.get(id=event_id)
        sessions = VoteSession.objects.filter(event=event)

        for session in sessions:
            email = None
            if session.voter:
                email = session.voter.email
            elif session.voter_email:
                email = session.voter_email

            if email and not email.endswith('@phone.evoting.local'):
                text    = f'Voting for {event.title} closes soon! Cast your vote now on {BRAND_NAME}.'
                subject = f'Last chance to vote - {event.title}'
                content = f"""
                  <h2 style="color:{BRAND_DARK};font-size:24px;font-weight:700;margin:0 0 8px;">
                    Don't Miss Out! &#9200;
                  </h2>
                  <p style="color:{BRAND_GRAY};font-size:15px;margin:0 0 24px;">
                    Voting for <strong style="color:{BRAND_DARK};">{event.title}</strong> is closing soon.
                    Make sure your voice is heard!
                  </p>
                  <div style="text-align:center;margin:32px 0;">
                    <a href="https://celervote.com/events/{event.slug}"
                       style="background:{BRAND_TEAL};color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                      Vote Now
                    </a>
                  </div>
                  <p style="color:{BRAND_GRAY};font-size:13px;margin:0;">
                    Every vote counts. Don't let your voice go unheard.
                  </p>
                """
                send_email(email, f'{BRAND_NAME} — {subject}', text, base_email(content))

            phone = None
            if session.voter and session.voter.phone:
                phone = session.voter.phone
            elif session.voter_phone:
                phone = session.voter_phone
            if phone:
                send_event_alert_sms_task.delay(
                    phone, event.title,
                    f'Voting closes soon! Cast your vote now at celervote.com/events/{event.slug}'
                )

    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2)
def send_custom_message_task(self, event_id: str, subject: str, message: str):
    """Send a custom admin message to all voters of an event."""
    try:
        from apps.events.models import Event
        from apps.voting.models import VoteSession

        event    = Event.objects.get(id=event_id)
        sessions = VoteSession.objects.filter(event=event)

        for session in sessions:
            email = None
            if session.voter:
                email = session.voter.email
            elif session.voter_email:
                email = session.voter_email

            if email and not email.endswith('@phone.evoting.local'):
                content = f"""
                  <h2 style="color:{BRAND_DARK};font-size:22px;font-weight:700;margin:0 0 8px;">
                    {subject}
                  </h2>
                  <p style="color:{BRAND_GRAY};font-size:14px;margin:0 0 24px;">
                    Message regarding <strong style="color:{BRAND_DARK};">{event.title}</strong>
                  </p>
                  <div style="background:{BRAND_LIGHT};border-left:4px solid {BRAND_TEAL};padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 24px;">
                    <p style="color:{BRAND_DARK};font-size:14px;margin:0;white-space:pre-line;">{message}</p>
                  </div>
                  <p style="color:{BRAND_GRAY};font-size:12px;margin:0;">
                    This message was sent by the organizer of {event.title}.
                  </p>
                """
                send_email(email, f'{BRAND_NAME} — {subject}', message, base_email(content))

            phone = None
            if session.voter and session.voter.phone:
                phone = session.voter.phone
            elif session.voter_phone:
                phone = session.voter_phone
            if phone:
                send_event_alert_sms_task.delay(phone, event.title, message[:140])

    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, name='backup.pg_dump')
def backup_database(self):
    """
    Periodic PostgreSQL backup via pg_dump.
    Uploads to Google Drive (primary) and keeps last 7 backups.
    Sends email alert to all superadmins on success or failure.
    Schedule via django-celery-beat: every 24h (cron: 0 2 * * *)
    """
    import subprocess, os, datetime, tempfile, gzip, shutil, json
    db_url = os.environ.get('DATABASE_URL', '')
    if not db_url:
        logger.error('[Backup] DATABASE_URL not set — backup skipped.')
        return {'error': 'DATABASE_URL not set'}

    timestamp = datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    tmp_path  = None
    gz_path   = None

    def _notify_admins(subject, body):
        """Email all superadmin accounts."""
        try:
            from django.contrib.auth import get_user_model
            _User = get_user_model()
            admins = _User.objects.filter(role='superadmin').exclude(email='').values_list('email', flat=True)
            for addr in admins:
                try:
                    send_email(addr, f'{BRAND_NAME} — {subject}', body)
                except Exception as e:
                    logger.error(f'[Backup] Failed to notify {addr}: {e}')
        except Exception as e:
            logger.error(f'[Backup] Admin notify error: {e}')

    def _get_drive_service():
        """Build an authenticated Google Drive service from env JSON."""
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        sa_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
        if not sa_json:
            raise ValueError('GOOGLE_SERVICE_ACCOUNT_JSON not set')
        info = json.loads(sa_json)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/drive']
        )
        return build('drive', 'v3', credentials=creds, cache_discovery=False)

    def _upload_to_drive(service, file_path, filename):
        """Upload file to the configured Google Drive folder."""
        from googleapiclient.http import MediaFileUpload
        folder_id = os.environ.get('GOOGLE_DRIVE_BACKUP_FOLDER_ID', '')
        if not folder_id:
            raise ValueError('GOOGLE_DRIVE_BACKUP_FOLDER_ID not set')
        meta = {
            'name':    filename,
            'parents': [folder_id],
        }
        media = MediaFileUpload(file_path, mimetype='application/gzip', resumable=True)
        f = service.files().create(body=meta, media_body=media, fields='id,webViewLink').execute()
        return f.get('webViewLink', f'https://drive.google.com/file/d/{f["id"]}/view')

    def _prune_old_backups(service, keep=7):
        """Delete backups older than the most recent `keep` files in the folder."""
        folder_id = os.environ.get('GOOGLE_DRIVE_BACKUP_FOLDER_ID', '')
        if not folder_id:
            return
        results = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false and name contains 'backup_'",
            orderBy='createdTime asc',
            fields='files(id,name,createdTime)',
            pageSize=50,
        ).execute()
        files = results.get('files', [])
        if len(files) > keep:
            for old in files[:-keep]:
                try:
                    service.files().delete(fileId=old['id']).execute()
                    logger.info(f'[Backup] Deleted old backup: {old["name"]}')
                except Exception as e:
                    logger.warning(f'[Backup] Could not delete {old["name"]}: {e}')

    try:
        # 1. pg_dump
        with tempfile.NamedTemporaryFile(suffix='.dump', delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            ['pg_dump', '--format=custom', '--file', tmp_path, db_url],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            msg = f'pg_dump failed: {result.stderr}'
            logger.error(f'[Backup] {msg}')
            _notify_admins('⚠️ Database Backup FAILED', f'Backup at {timestamp} failed.

{msg}')
            return {'error': msg}

        # 2. Gzip (5-10x smaller)
        gz_path  = tmp_path + '.gz'
        filename = f'backup_{timestamp}.dump.gz'
        with open(tmp_path, 'rb') as f_in, gzip.open(gz_path, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)

        dump_size = os.path.getsize(tmp_path)
        gz_size   = os.path.getsize(gz_path)
        logger.info(f'[Backup] Dump: {dump_size/1024:.0f}KB → Gzipped: {gz_size/1024:.0f}KB')

        # 3. Upload to Google Drive
        drive   = _get_drive_service()
        gdrive_url = _upload_to_drive(drive, gz_path, filename)
        logger.info(f'[Backup] ✅ Uploaded to Google Drive: {gdrive_url}')

        # 4. Prune old backups (keep last 7)
        _prune_old_backups(drive, keep=7)

        # 5. Email superadmins
        _notify_admins(
            '✅ Database Backup Successful',
            f'CelerVote database backup completed successfully.

'
            f'Timestamp : {timestamp}
'
            f'File      : {filename}
'
            f'Size      : {gz_size / 1024:.0f} KB (compressed)
'
            f'Google Drive: {gdrive_url}

'
            f'To restore:
'
            f'  1. Download and decompress: gunzip {filename}
'
            f'  2. Restore: pg_restore --clean --if-exists -d $DATABASE_URL backup_{timestamp}.dump'
        )

        return {
            'status':    'ok',
            'file':      filename,
            'gdrive':    gdrive_url,
            'timestamp': timestamp,
            'size_kb':   gz_size // 1024,
        }

    except Exception as e:
        logger.error(f'[Backup] Unexpected error: {e}')
        _notify_admins(
            '⚠️ Database Backup FAILED',
            f'Backup at {timestamp} failed with error:

{str(e)}'
        )
        return {'error': str(e)}

    finally:
        for p in [tmp_path, gz_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except Exception:
                    pass
