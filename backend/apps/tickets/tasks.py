import logging
import base64
import requests
import io
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

BRAND_NAME = "CelerVote"
BRAND_TEAL = "#14b8a6"
BRAND_DARK = "#0f172a"
BRAND_GRAY = "#64748b"


def get_qr_bytes(ticket):
    """Return raw QR image bytes."""
    try:
        if ticket.qr_code:
            import urllib.request
            with urllib.request.urlopen(ticket.qr_code.url) as r:
                return r.read()
    except Exception as e:
        logger.warning(f"Could not fetch QR code: {e}")
    return None


def generate_ticket_pdf(ticket):
    """
    Generate a styled ticket PDF using reportlab.
    Returns PDF bytes or None if reportlab is not installed.
    """
    try:
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas as rl_canvas

        event      = ticket.tier.event
        event_date = event.event_date.strftime("%a, %d %b %Y  %I:%M %p")
        tier_color = getattr(ticket.tier, "color", BRAND_TEAL) or BRAND_TEAL

        def hex_to_rgb(h):
            h = h.lstrip("#")
            return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

        teal_rgb = hex_to_rgb(BRAND_TEAL)
        dark_rgb = hex_to_rgb(BRAND_DARK)
        tier_rgb = hex_to_rgb(tier_color)

        buf    = io.BytesIO()
        PAGE_W = 148 * mm
        PAGE_H = 105 * mm
        c      = rl_canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

        # Dark background
        c.setFillColorRGB(*dark_rgb)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

        # Teal left accent bar
        c.setFillColorRGB(*teal_rgb)
        c.rect(0, 0, 5 * mm, PAGE_H, fill=1, stroke=0)

        # White ticket body
        bx, by, bw, bh = 9 * mm, 7 * mm, PAGE_W - 13 * mm, PAGE_H - 14 * mm
        c.setFillColorRGB(1, 1, 1)
        c.roundRect(bx, by, bw, bh, 4 * mm, fill=1, stroke=0)

        # Header band
        hh = 18 * mm
        c.setFillColorRGB(*teal_rgb)
        c.roundRect(bx, by + bh - hh, bw, hh, 4 * mm, fill=1, stroke=0)
        c.rect(bx, by + bh - hh, bw, hh / 2, fill=1, stroke=0)  # flatten bottom

        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 11)
        title = event.title if len(event.title) <= 40 else event.title[:38] + "…"
        c.drawCentredString(bx + bw / 2, by + bh - 8 * mm, title)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(bx + bw / 2, by + bh - 13.5 * mm, f"✦ {BRAND_NAME.upper()} — SECURE TICKET")

        # Dashed tear line
        tear_y = by + bh - hh - 5 * mm
        c.setStrokeColorRGB(0.75, 0.75, 0.75)
        c.setDash(2, 3)
        c.line(bx + 2 * mm, tear_y, bx + bw - 2 * mm, tear_y)
        c.setDash()

        # QR code
        qr_bytes = get_qr_bytes(ticket)
        qs       = 34 * mm
        qx       = bx + 4 * mm
        qy       = by + 12 * mm
        if qr_bytes:
            from reportlab.lib.utils import ImageReader
            c.drawImage(ImageReader(io.BytesIO(qr_bytes)), qx, qy, width=qs, height=qs,
                        preserveAspectRatio=True, mask='auto')
        else:
            c.setFillColorRGB(0.9, 0.9, 0.9)
            c.roundRect(qx, qy, qs, qs, 2 * mm, fill=1, stroke=0)

        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.setFont("Helvetica", 5.5)
        c.drawCentredString(qx + qs / 2, qy - 3.5 * mm, "SCAN AT ENTRANCE")

        # Details right of QR
        dx   = qx + qs + 5 * mm
        dw   = bx + bw - dx - 2 * mm
        cy   = tear_y - 7 * mm

        def field(label, value, y, vc=None):
            c.setFillColorRGB(0.55, 0.55, 0.55)
            c.setFont("Helvetica", 5.5)
            c.drawString(dx, y + 4.5 * mm, label.upper())
            c.setFillColorRGB(*(hex_to_rgb(vc) if vc else dark_rgb))
            c.setFont("Helvetica-Bold", 7.5)
            v = str(value)
            if len(v) > 30: v = v[:28] + "…"
            c.drawString(dx, y, v)

        field("Show Name", event.title, cy)
        field("Date & Time", event_date, cy - 12 * mm)
        field("Venue", event.venue, cy - 24 * mm)

        # Bottom strip
        sy = by + 2 * mm
        sh = 9 * mm
        c.setFillColorRGB(0.96, 0.96, 0.96)
        c.rect(bx, sy, bw, sh, fill=1, stroke=0)

        c.setFillColorRGB(*dark_rgb)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(bx + 3 * mm, sy + 5.5 * mm, ticket.buyer_name.upper()[:28])

        # Tier badge
        bw2  = 24 * mm
        bx2  = bx + bw / 2 - bw2 / 2
        c.setFillColorRGB(*tier_rgb)
        c.roundRect(bx2, sy + 1.5 * mm, bw2, 5.5 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 6)
        c.drawCentredString(bx2 + bw2 / 2, sy + 3.8 * mm, ticket.tier.name.upper()[:18])

        # Ticket code + price
        c.setFillColorRGB(*dark_rgb)
        c.setFont("Helvetica-Bold", 7)
        c.drawRightString(bx + bw - 3 * mm, sy + 5.5 * mm, ticket.ticket_code)
        c.setFillColorRGB(*teal_rgb)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawRightString(bx + bw - 3 * mm, sy + 1 * mm, f"GHS {ticket.total_amount}")

        c.save()
        return buf.getvalue()

    except ImportError:
        logger.warning("reportlab not installed — skipping PDF generation")
        return None
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None


def build_ticket_email(ticket):
    """HTML ticket email — QR uses CID inline attachment."""
    event      = ticket.tier.event
    event_date = event.event_date.strftime("%A, %d %B %Y · %I:%M %p")
    first_name = ticket.buyer_name.split()[0]
    qty_label  = f"{ticket.quantity} ticket{'s' if ticket.quantity > 1 else ''}"
    tier_color = getattr(ticket.tier, "color", BRAND_TEAL) or BRAND_TEAL

    qr_img = '<img src="cid:qrcode" alt="QR Code" width="200" height="200" style="display:block;border-radius:8px;" />'

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Your Ticket</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.12);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0c2340 100%);padding:40px 36px 32px;text-align:center;">
      <div style="display:inline-block;background:{BRAND_TEAL};border-radius:20px;padding:6px 16px;margin-bottom:20px;">
        <span style="color:#fff;font-size:12px;font-weight:800;letter-spacing:2px;">✦ {BRAND_NAME.upper()}</span>
      </div>
      <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0 0 10px;">{event.title}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0;">🗓&nbsp;&nbsp;{event_date}</p>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0;">📍&nbsp;&nbsp;{event.venue}</p>
    </td>
  </tr>

  <!-- TEAR LINE -->
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="24" style="background:#fff;">&nbsp;</td>
      <td style="border-top:2px dashed #cbd5e1;">&nbsp;</td>
      <td width="24" style="background:#fff;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:32px 36px 36px;">
    <p style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px;">🎉 You're confirmed, {first_name}!</p>
    <p style="font-size:14px;color:{BRAND_GRAY};margin:0 0 28px;">Show the QR code below at the entrance. Your ticket PDF is also attached.</p>

    <!-- QR -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr><td align="center">
        <div style="display:inline-block;background:#f8fafc;border:3px solid #e2e8f0;border-radius:20px;padding:16px;">
          {qr_img}
        </div>
        <p style="color:{BRAND_GRAY};font-size:10px;margin:10px 0 0;letter-spacing:2px;text-transform:uppercase;">Scan to verify at entrance</p>
      </td></tr>
    </table>

    <!-- Ticket code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:14px;margin-bottom:24px;">
      <tr><td style="padding:18px 24px;text-align:center;">
        <p style="color:{BRAND_GRAY};font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 6px;">Ticket Code</p>
        <p style="font-family:'Courier New',monospace;font-size:26px;font-weight:900;color:#0f172a;letter-spacing:5px;margin:0;">{ticket.ticket_code}</p>
      </td></tr>
    </table>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f8fafc;">
        <td style="padding:11px 20px;font-size:11px;color:{BRAND_GRAY};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;width:38%;">Buyer</td>
        <td style="padding:11px 20px;font-size:14px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">{ticket.buyer_name}</td>
      </tr>
      <tr>
        <td style="padding:11px 20px;font-size:11px;color:{BRAND_GRAY};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">Tier</td>
        <td style="padding:11px 20px;font-size:14px;font-weight:700;color:{tier_color};border-bottom:1px solid #e2e8f0;">{ticket.tier.name}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:11px 20px;font-size:11px;color:{BRAND_GRAY};text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;">Quantity</td>
        <td style="padding:11px 20px;font-size:14px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">{qty_label}</td>
      </tr>
      <tr>
        <td style="padding:11px 20px;font-size:11px;color:{BRAND_GRAY};text-transform:uppercase;letter-spacing:1px;">Amount</td>
        <td style="padding:11px 20px;font-size:16px;font-weight:800;color:{BRAND_TEAL};">GHS {ticket.total_amount}</td>
      </tr>
    </table>

    <!-- Info -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 12px 12px 0;">
      <tr><td style="padding:14px 18px;">
        <p style="color:#1e40af;font-size:13px;font-weight:700;margin:0 0 4px;">📱 How to use your ticket</p>
        <p style="color:#3b82f6;font-size:12px;margin:0;line-height:1.7;">
          Show the QR code above or quote <strong>{ticket.ticket_code}</strong> at the entrance.
          Your ticket PDF is attached — save it for quick access on the day.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.7;">
        &copy; 2026 <strong>{BRAND_NAME}</strong> &mdash; Secure Electronic Ticketing<br/>
        <span style="font-size:10px;color:#cbd5e1;">If you did not purchase this ticket, contact support immediately.</span>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def send_email(to, subject, html_body, text_body="", qr_bytes=None, pdf_bytes=None, ticket_code=""):
    from django.core.mail import EmailMultiAlternatives
    from email.mime.image import MIMEImage
    from email.mime.base import MIMEBase
    from email import encoders

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body or subject,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to],
        )
        msg.mixed_subtype = 'related'
        msg.attach_alternative(html_body, "text/html")

        # Inline QR via CID — renders inside email body in all clients
        if qr_bytes:
            qr_mime = MIMEImage(qr_bytes)
            qr_mime.add_header('Content-ID', '<qrcode>')
            qr_mime.add_header('Content-Disposition', 'inline', filename='qrcode.png')
            msg.attach(qr_mime)

        # PDF attached for download
        if pdf_bytes:
            pdf_part = MIMEBase('application', 'pdf')
            pdf_part.set_payload(pdf_bytes)
            encoders.encode_base64(pdf_part)
            pdf_part.add_header('Content-Disposition', 'attachment',
                                 filename=f'ticket-{ticket_code}.pdf')
            msg.attach(pdf_part)

        msg.send()
        logger.info(f"Ticket email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send ticket email to {to}: {e}")
        raise


def send_sms(phone, message):
    """Send SMS via Arkesel (same provider used for OTP)."""
    try:
        url = "https://sms.arkesel.com/sms/api"
        params = {
            "action":  "send-sms",
            "api_key": settings.ARKESEL_API_KEY,
            "to":      phone,
            "from":    settings.ARKESEL_SENDER_ID,
            "sms":     message,
        }
        res  = requests.get(url, params=params, timeout=15)
        data = res.json()
        if data.get("code") != "ok":
            raise Exception(f"Arkesel SMS error: {data}")
        logger.info(f"Ticket SMS sent to {phone} via Arkesel: {data}")
        return data
    except Exception as e:
        logger.error(f"Failed to send SMS to {phone}: {e}")


def send_whatsapp(phone, message, qr_url=None):
    try:
        at_key = getattr(settings, "AFRICASTALKING_WHATSAPP_KEY", None)
        if at_key:
            headers = {"apiKey": at_key, "Content-Type": "application/json"}
            payload = {
                "from": getattr(settings, "AFRICASTALKING_WHATSAPP_NUMBER", ""),
                "to":   phone,
                "body": message,
            }
            if qr_url:
                payload["mediaUrl"] = qr_url
            res = requests.post(
                "https://api.africastalking.com/version1/messaging/whatsapp",
                json=payload, headers=headers,
            )
            logger.info(f"WhatsApp sent to {phone}: {res.status_code}")
        else:
            logger.info(f"WhatsApp not configured — skipping for {phone}")
    except Exception as e:
        logger.error(f"Failed to send WhatsApp to {phone}: {e}")

def build_multi_ticket_email(tickets):
    """Build one email showing all tickets with their QR codes."""
    if not tickets:
        return ""
    order      = tickets[0]
    event      = order.tier.event
    event_date = event.event_date.strftime("%A, %d %B %Y · %I:%M %p")
    first_name = order.buyer_name.split()[0]
    total_amt  = sum(float(t.total_amount) for t in tickets)
    tier_color = getattr(order.tier, "color", BRAND_TEAL) or BRAND_TEAL

    # Build a ticket card for each individual ticket
    ticket_cards = ""
    for i, t in enumerate(tickets):
        qr_img = f'<img src="cid:qrcode{i}" alt="QR" width="160" height="160" style="display:block;border-radius:8px;" />'
        ticket_cards += f"""
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;margin-bottom:16px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#fff;">
              <p style="margin:0;font-size:11px;color:{BRAND_GRAY};text-transform:uppercase;letter-spacing:1.5px;">
                Ticket {i+1} of {len(tickets)}
              </p>
              <p style="margin:4px 0 0;font-family:'Courier New',monospace;font-size:20px;font-weight:900;
                         color:#0f172a;letter-spacing:4px;">{t.ticket_code}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;width:180px;">
                    <div style="background:#fff;border:2px solid #e2e8f0;border-radius:12px;
                                 padding:10px;display:inline-block;">
                      {qr_img}
                    </div>
                    <p style="color:{BRAND_GRAY};font-size:9px;margin:6px 0 0;
                               letter-spacing:1.5px;text-transform:uppercase;text-align:center;">
                      Scan at entrance
                    </p>
                  </td>
                  <td style="vertical-align:top;padding-left:16px;">
                    <p style="margin:0 0 6px;font-size:11px;color:{BRAND_GRAY};">Tier</p>
                    <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:{tier_color};">{t.tier.name}</p>
                    <p style="margin:0 0 6px;font-size:11px;color:{BRAND_GRAY};">Buyer</p>
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#0f172a;">{t.buyer_name}</p>
                    <p style="margin:0 0 6px;font-size:11px;color:{BRAND_GRAY};">Amount</p>
                    <p style="margin:0;font-size:14px;font-weight:800;color:{BRAND_TEAL};">
                      GHS {t.total_amount}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Your Tickets</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:24px;overflow:hidden;
                            box-shadow:0 20px 60px rgba(0,0,0,0.12);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0c2340 100%);
               padding:36px;text-align:center;">
      <div style="display:inline-block;background:{BRAND_TEAL};border-radius:20px;
                   padding:6px 16px;margin-bottom:16px;">
        <span style="color:#fff;font-size:12px;font-weight:800;letter-spacing:2px;">
          ✦ {BRAND_NAME.upper()}
        </span>
      </div>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 8px;">{event.title}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0;">🗓&nbsp;&nbsp;{event_date}</p>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0;">📍&nbsp;&nbsp;{event.venue}</p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr><td style="padding:28px 32px 8px;">
    <p style="font-size:19px;font-weight:800;color:#0f172a;margin:0 0 6px;">
      🎉 You're confirmed, {first_name}!
    </p>
    <p style="font-size:13px;color:{BRAND_GRAY};margin:0 0 8px;">
      You have <strong>{len(tickets)} ticket(s)</strong> for this event.
      Total paid: <strong style="color:{BRAND_TEAL};">GHS {total_amt:,.2f}</strong>
    </p>
    <p style="font-size:13px;color:{BRAND_GRAY};margin:0 0 20px;">
      Each ticket below has its own QR code. Show the QR or ticket code at the entrance.
      PDFs are also attached.
    </p>
  </td></tr>

  <!-- TICKET CARDS -->
  <tr><td style="padding:0 32px 28px;">
    {ticket_cards}
  </td></tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.7;">
        &copy; 2026 <strong>{BRAND_NAME}</strong> — Secure Electronic Ticketing<br/>
        <span style="font-size:10px;color:#cbd5e1;">
          If you did not purchase these tickets, contact support immediately.
        </span>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>"""

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_ticket_confirmation_task(self, ticket_id: str):
    """Send email (inline QR + PDF attachment) + SMS + WhatsApp."""
    try:
        from .models import Ticket
        ticket = Ticket.objects.select_related("tier__event", "buyer").get(id=ticket_id)
        event  = ticket.tier.event
        sent   = ticket.notifications_sent or {}

        qr_bytes  = get_qr_bytes(ticket)
        pdf_bytes = generate_ticket_pdf(ticket)

        # EMAIL
        if not sent.get("email") and ticket.buyer_email:
            try:
                send_email(
                    to          = ticket.buyer_email,
                    subject     = f"🎟 Your Ticket — {event.title} [{ticket.ticket_code}]",
                    html_body   = build_ticket_email(ticket),
                    text_body   = (
                        f"Hi {ticket.buyer_name},\n\n"
                        f"Your ticket for {event.title} is confirmed!\n"
                        f"Ticket Code: {ticket.ticket_code}\n"
                        f"Tier: {ticket.tier.name}\n"
                        f"Date: {event.event_date.strftime('%d %b %Y %H:%M')}\n"
                        f"Venue: {event.venue}\n\n"
                        f"Show this code or your QR at the entrance.\n\n"
                        f"— {BRAND_NAME} Team"
                    ),
                    qr_bytes    = qr_bytes,
                    pdf_bytes   = pdf_bytes,
                    ticket_code = ticket.ticket_code,
                )
                sent["email"] = True
            except Exception as e:
                logger.error(f"Email failed for ticket {ticket_id}: {e}")

        # SMS
        if not sent.get("sms") and ticket.buyer_phone:
            try:
                send_sms(ticket.buyer_phone, (
                    f"🎟 {BRAND_NAME} TICKET CONFIRMED!\n"
                    f"Event: {event.title}\n"
                    f"Tier: {ticket.tier.name}\n"
                    f"Code: {ticket.ticket_code}\n"
                    f"Date: {event.event_date.strftime('%d %b %Y')}\n"
                    f"Venue: {event.venue}\n"
                    f"Show code or QR at entry."
                ))
                sent["sms"] = True
            except Exception as e:
                logger.error(f"SMS failed for ticket {ticket_id}: {e}")

        # WHATSAPP
        if not sent.get("whatsapp") and ticket.buyer_phone:
            try:
                qr_url = ticket.qr_code.url if ticket.qr_code else None
                send_whatsapp(ticket.buyer_phone, (
                    f"🎉 *{BRAND_NAME} — Ticket Confirmed!*\n\n"
                    f"Hi {ticket.buyer_name.split()[0]}! Your ticket is ready.\n\n"
                    f"🎟 *Event:* {event.title}\n"
                    f"🏷 *Tier:* {ticket.tier.name}\n"
                    f"🔑 *Code:* `{ticket.ticket_code}`\n"
                    f"📅 *Date:* {event.event_date.strftime('%d %b %Y · %I:%M %p')}\n"
                    f"📍 *Venue:* {event.venue}\n\n"
                    f"Show your QR code or ticket code at the entrance. See you there! 🎊"
                ), qr_url=qr_url)
                sent["whatsapp"] = True
            except Exception as e:
                logger.error(f"WhatsApp failed for ticket {ticket_id}: {e}")

        ticket.notifications_sent = sent
        ticket.save(update_fields=["notifications_sent"])

    except Exception as exc:
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_ticket_order_confirmation_task(self, ticket_ids: list):
    """Send ONE email with all tickets in the order (one per quantity)."""
    try:
        from .models import Ticket
        tickets = list(
            Ticket.objects.select_related("tier__event", "buyer")
            .filter(id__in=ticket_ids)
            .order_by('created_at')
        )
        if not tickets:
            return

        order   = tickets[0]
        event   = order.tier.event
        sent    = order.notifications_sent or {}

        # SMS FIRST — send immediately so buyer gets code fast
        if not sent.get("sms") and order.buyer_phone:
            try:
                codes = ", ".join(t.ticket_code for t in tickets)
                send_sms(order.buyer_phone, (
    f"🎟 {BRAND_NAME} — {len(tickets)} TICKET(S) CONFIRMED!\n"
    f"Event: {event.title}\n"
    f"Tier: {order.tier.name}\n"
    f"Codes: {codes}\n"
    f"Date: {event.event_date.strftime('%d %b %Y')}\n"
    f"Venue: {event.venue}"
))
                sent["sms"] = True
                order.notifications_sent = sent
                order.save(update_fields=["notifications_sent"])
            except Exception as e:
                logger.error(f"SMS failed: {e}")

        # EMAIL — all tickets in one email
        if not sent.get("email") and order.buyer_email:
            try:
                html_body  = build_multi_ticket_email(tickets)
                text_body  = (
                    f"Hi {order.buyer_name.split()[0]},\n\n"
                    f"Your {len(tickets)} ticket(s) for {event.title} are confirmed!\n\n"
                    + "\n".join([
                        f"Ticket {i+1}: {t.ticket_code} — {t.tier.name}"
                        for i, t in enumerate(tickets)
                    ])
                    + f"\n\nDate: {event.event_date.strftime('%d %b %Y %H:%M')}"
                    + f"\nVenue: {event.venue}"
                    + f"\n\nShow QR code or ticket code at entrance.\n\n— {BRAND_NAME} Team"
                )

                # Generate QR bytes and PDF for each ticket
                all_qr    = [get_qr_bytes(t) for t in tickets]
                all_pdfs  = [generate_ticket_pdf(t) for t in tickets]

                from django.core.mail import EmailMultiAlternatives
                from email.mime.image import MIMEImage
                from email.mime.base import MIMEBase
                from email import encoders

                msg = EmailMultiAlternatives(
                    subject=f"🎟 Your {len(tickets)} Ticket(s) — {event.title}",
                    body=text_body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[order.buyer_email],
                )
                msg.mixed_subtype = 'related'
                msg.attach_alternative(html_body, "text/html")

                # Attach each QR inline with unique CID
                for i, (t, qr) in enumerate(zip(tickets, all_qr)):
                    if qr:
                        qr_mime = MIMEImage(qr)
                        qr_mime.add_header('Content-ID', f'<qrcode{i}>')
                        qr_mime.add_header('Content-Disposition', 'inline', filename=f'qr-{t.ticket_code}.png')
                        msg.attach(qr_mime)

                # Attach each PDF
                for i, (t, pdf) in enumerate(zip(tickets, all_pdfs)):
                    if pdf:
                        pdf_part = MIMEBase('application', 'pdf')
                        pdf_part.set_payload(pdf)
                        encoders.encode_base64(pdf_part)
                        pdf_part.add_header('Content-Disposition', 'attachment',
                                            filename=f'ticket-{t.ticket_code}.pdf')
                        msg.attach(pdf_part)

                msg.send()
                logger.info(f"Multi-ticket email sent to {order.buyer_email}")
                sent["email"] = True
            except Exception as e:
                logger.error(f"Multi-ticket email failed: {e}")

        order.notifications_sent = sent
        order.save(update_fields=["notifications_sent"])

    except Exception as exc:
        raise self.retry(exc=exc)
