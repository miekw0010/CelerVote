"""
Analytics Service
- Event summary stats
- Votes over time
- PDF export (branded, clean)
- CSV export
"""
import csv
import io
from datetime import timedelta

from django.http import HttpResponse
from django.db.models import Count, Sum
from django.db.models.functions import TruncHour
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.events.models import Event, Candidate
from apps.voting.models import VoteSession
from apps.payments.models import Payment


# ── Analytics Views ───────────────────────────────────────────────────────────

class EventAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        sessions     = VoteSession.objects.filter(event=event)
        total_voters = sessions.count()
        total_votes  = event.total_votes
        flagged      = sessions.filter(is_flagged=True).count()
        revenue      = Payment.objects.filter(
            event=event, status='success'
        ).aggregate(total=Sum('amount'))['total'] or 0

        since = timezone.now() - timedelta(hours=24)
        from apps.voting.models import Vote
        votes_over_time = list(
            Vote.objects
            .filter(event=event, created_at__gte=since)
            .annotate(hour=TruncHour('created_at'))
            .values('hour')
            .annotate(count=Count('id'))
            .order_by('hour')
        )

        categories_data = []
        for cat in event.categories.filter(is_active=True):
            candidates = Candidate.objects.filter(
                category=cat, is_active=True
            ).order_by('-vote_count')
            categories_data.append({
                'id':   str(cat.id),
                'name': cat.name,
                'candidates': [
                    {
                        'id':         str(c.id),
                        'name':       c.name,
                        'vote_count': c.vote_count,
                        'percentage': c.vote_percentage,
                    }
                    for c in candidates
                ]
            })

        return Response({
            'summary': {
                'total_votes':      total_votes,
                'total_voters':     total_voters,
                'flagged_sessions': flagged,
                'revenue':          float(revenue),
                'currency':         event.currency,
            },
            'votes_over_time': votes_over_time,
            'categories':      categories_data,
        })


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == 'superadmin':
            events = Event.objects.all()
        else:
            events = Event.objects.filter(organizer=request.user)

        total_events  = events.count()
        active_events = events.filter(status='active').count()
        total_votes   = events.aggregate(t=Sum('total_votes'))['t'] or 0
        total_revenue = Payment.objects.filter(
            event__in=events, status='success'
        ).aggregate(t=Sum('amount'))['t'] or 0

        recent_events = list(
            events.order_by('-created_at')[:5].values(
                'id', 'title', 'slug', 'status', 'total_votes', 'created_at'
            )
        )

        return Response({
            'total_events':  total_events,
            'active_events': active_events,
            'total_votes':   total_votes,
            'total_revenue': float(total_revenue),
            'recent_events': recent_events,
        })


# ── PDF Export ────────────────────────────────────────────────────────────────

def export_results_pdf(event: Event) -> HttpResponse:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph,
        Spacer, HRFlowable, KeepTogether
    )
    from reportlab.pdfgen import canvas as rl_canvas

    # ── Colors ──
    TEAL       = colors.HexColor('#14b8a6')
    DARK       = colors.HexColor('#0f172a')
    SLATE      = colors.HexColor('#1e293b')
    GRAY       = colors.HexColor('#64748b')
    LIGHT      = colors.HexColor('#f8fafc')
    BORDER     = colors.HexColor('#e2e8f0')
    YELLOW     = colors.HexColor('#f59e0b')
    GREEN      = colors.HexColor('#10b981')
    RED        = colors.HexColor('#ef4444')
    BAR_EMPTY  = colors.HexColor('#e2e8f0')
    WHITE      = colors.white

    # ── Page Setup ──
    buffer   = io.BytesIO()
    W, H     = A4
    LEFT     = 20 * mm
    RIGHT    = 20 * mm
    TOP      = 20 * mm
    BOTTOM   = 20 * mm
    CW       = W - LEFT - RIGHT   # content width

    # ── Styles ──
    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    STYLES = {
        'h1':       S('h1',      fontSize=18, fontName='Helvetica-Bold', textColor=DARK,  leading=22, spaceAfter=2),
        'h2':       S('h2',      fontSize=12, fontName='Helvetica-Bold', textColor=DARK,  leading=16, spaceBefore=4, spaceAfter=2),
        'body':     S('body',    fontSize=9,  fontName='Helvetica',      textColor=GRAY,  leading=13),
        'bold':     S('bold',    fontSize=9,  fontName='Helvetica-Bold', textColor=DARK,  leading=13),
        'small':    S('small',   fontSize=8,  fontName='Helvetica',      textColor=GRAY,  leading=11),
        'center':   S('center',  fontSize=9,  fontName='Helvetica',      textColor=GRAY,  leading=13, alignment=TA_CENTER),
        'right':    S('right',   fontSize=9,  fontName='Helvetica',      textColor=GRAY,  leading=13, alignment=TA_RIGHT),
        'white':    S('white',   fontSize=9,  fontName='Helvetica-Bold', textColor=WHITE, leading=13, alignment=TA_CENTER),
        'th':       S('th',      fontSize=8,  fontName='Helvetica-Bold', textColor=WHITE, leading=12, alignment=TA_CENTER),
        'td':       S('td',      fontSize=9,  fontName='Helvetica',      textColor=DARK,  leading=13),
        'td_c':     S('td_c',    fontSize=9,  fontName='Helvetica',      textColor=DARK,  leading=13, alignment=TA_CENTER),
        'td_r':     S('td_r',    fontSize=9,  fontName='Helvetica',      textColor=DARK,  leading=13, alignment=TA_RIGHT),
        'winner':   S('winner',  fontSize=9,  fontName='Helvetica-Bold', textColor=YELLOW,leading=13),
        'stat_v':   S('stat_v',  fontSize=22, fontName='Helvetica-Bold', textColor=TEAL,  leading=26, alignment=TA_CENTER),
        'stat_l':   S('stat_l',  fontSize=8,  fontName='Helvetica',      textColor=GRAY,  leading=11, alignment=TA_CENTER),
        'footer':   S('footer',  fontSize=7,  fontName='Helvetica',      textColor=GRAY,  leading=10, alignment=TA_CENTER),
        'rank_w':   S('rank_w',  fontSize=10, fontName='Helvetica-Bold', textColor=WHITE, leading=14, alignment=TA_CENTER),
        'rank_g':   S('rank_g',  fontSize=10, fontName='Helvetica-Bold', textColor=GRAY,  leading=14, alignment=TA_CENTER),
    }

    # ── Data ──
    sessions     = VoteSession.objects.filter(event=event)
    total_voters = sessions.count()
    flagged      = sessions.filter(is_flagged=True).count()
    revenue      = Payment.objects.filter(
        event=event, status='success'
    ).aggregate(t=Sum('amount'))['t'] or 0

    generated_at = timezone.now().strftime('%d %b %Y, %H:%M UTC')
    status_label = {
        'active': 'LIVE', 'ended': 'ENDED',
        'paused': 'PAUSED', 'draft': 'DRAFT',
        'scheduled': 'UPCOMING',
    }.get(event.status, event.status.upper())

    elements = []

    # ══════════════════════════════════════════════
    # HEADER
    # ══════════════════════════════════════════════
    # Dark banner
    header_data = [[
        Paragraph('CelerVote', S('hbrand', fontSize=20, fontName='Helvetica-Bold', textColor=WHITE, leading=24)),
        Paragraph(
            f'<b>{event.title}</b><br/>'
            f'<font size="8" color="#94a3b8">{status_label} &nbsp;·&nbsp; {generated_at}</font>',
            S('htitle', fontSize=13, fontName='Helvetica-Bold', textColor=WHITE, leading=18, alignment=TA_RIGHT)
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[CW * 0.45, CW * 0.55])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), DARK),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 14),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 14),
        ('TOPPADDING',    (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    elements.append(header_tbl)

    # Teal accent line
    accent = Table([['']], colWidths=[CW])
    accent.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), TEAL),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(accent)
    elements.append(Spacer(1, 10))

    # ══════════════════════════════════════════════
    # STAT CARDS
    # ══════════════════════════════════════════════
    cats_count = event.categories.filter(is_active=True).count()
    stats = [
        (str(event.total_votes), 'Total Votes'),
        (str(total_voters),      'Voters'),
        (str(cats_count),        'Categories'),
    ]
    if event.is_paid:
        stats.append((f'{event.currency} {float(revenue):,.2f}', 'Revenue'))
    if flagged > 0:
        stats.append((str(flagged), 'Flagged'))

    n     = len(stats)
    s_cw  = CW / n
    s_row = [[
        Table(
            [[Paragraph(v, STYLES['stat_v'])], [Paragraph(l, STYLES['stat_l'])]],
            colWidths=[s_cw - 4]
        )
        for v, l in stats
    ]]
    stats_tbl = Table(s_row, colWidths=[s_cw] * n)
    stats_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), LIGHT),
        ('TOPPADDING',    (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING',   (0, 0), (-1, -1), 2),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 2),
        ('LINEAFTER',     (0, 0), (-2, -1), 0.5, BORDER),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(stats_tbl)
    elements.append(Spacer(1, 6))

    # Meta info row
    meta = []
    if event.start_time:
        meta.append(f'Start: {event.start_time.strftime("%d %b %Y")}')
    if event.end_time:
        meta.append(f'End: {event.end_time.strftime("%d %b %Y")}')
    meta.append(f'Type: {event.event_type.replace("_", " ").title()}')
    meta.append(f'Voting: {event.voting_type.replace("_", " ").title()}')
    if event.is_paid:
        meta.append(f'Fee: {event.currency} {event.price_per_vote}/vote')

    if meta:
        elements.append(Paragraph('  ·  '.join(meta), STYLES['small']))
        elements.append(Spacer(1, 4))

    elements.append(HRFlowable(width=CW, thickness=0.5, color=BORDER))
    elements.append(Spacer(1, 10))

    # ══════════════════════════════════════════════
    # CATEGORY RESULTS
    # ══════════════════════════════════════════════
    for ci, cat in enumerate(event.categories.filter(is_active=True)):
        candidates  = list(cat.candidates.filter(is_active=True).order_by('-vote_count'))
        total_cv    = sum(c.vote_count for c in candidates)
        top_v       = candidates[0].vote_count if candidates else 0
        is_tied     = (len(candidates) > 1 and
                       candidates[0].vote_count == candidates[1].vote_count and
                       top_v > 0)

        cat_els = []

        # Category title row
        outcome = 'TIED' if is_tied else ('DECIDED' if top_v > 0 else 'NO VOTES')
        out_color = GREEN if not is_tied and top_v > 0 else (YELLOW if is_tied else GRAY)
        cat_hdr = Table([[
            Paragraph(f'{ci + 1}.  {cat.name}', STYLES['h2']),
            Paragraph(
                f'{len(candidates)} candidates  ·  {total_cv:,} votes',
                S('ch', fontSize=8, fontName='Helvetica', textColor=GRAY, leading=12, alignment=TA_RIGHT)
            ),
            Paragraph(outcome, S('out', fontSize=8, fontName='Helvetica-Bold', textColor=out_color, leading=12, alignment=TA_RIGHT)),
        ]], colWidths=[CW * 0.45, CW * 0.38, CW * 0.17])
        cat_hdr.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'BOTTOM'),
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING',   (0, 0), (-1, -1), 0),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ]))
        cat_els.append(cat_hdr)

        # Teal underline
        cat_line = Table([['']], colWidths=[CW])
        cat_line.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), TEAL),
            ('TOPPADDING',    (0, 0), (-1, -1), 1.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        cat_els.append(cat_line)
        cat_els.append(Spacer(1, 5))

        if not candidates:
            cat_els.append(Paragraph('No candidates in this category.', STYLES['body']))
        else:
            # Table header
            tdata = [[
                Paragraph('#',         STYLES['th']),
                Paragraph('Candidate', STYLES['th']),
                Paragraph('Votes',     STYLES['th']),
                Paragraph('Share',     STYLES['th']),
                Paragraph('Progress',  STYLES['th']),
            ]]

            col_w = [
                CW * 0.07,   # rank
                CW * 0.32,   # name
                CW * 0.11,   # votes
                CW * 0.10,   # share
                CW * 0.40,   # progress bar
            ]

            for ri, c in enumerate(candidates):
                pct     = (c.vote_count / total_cv * 100) if total_cv > 0 else 0
                is_top  = c.vote_count == top_v and top_v > 0

                # Rank cell — gold circle for winner, plain number for others
                if is_top and not is_tied:
                    rank_cell = Table(
                        [[Paragraph('1', STYLES['rank_w'])]],
                        colWidths=[col_w[0] - 4],
                        rowHeights=[16],
                    )
                    rank_cell.setStyle(TableStyle([
                        ('BACKGROUND',    (0, 0), (-1, -1), YELLOW),
                        ('TOPPADDING',    (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
                        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                    ]))
                else:
                    rank_cell = Paragraph(str(ri + 1), STYLES['rank_g'])

                # Name style
                name_style = STYLES['winner'] if (is_top and not is_tied) else STYLES['td']

                # Progress bar as two-cell table
                bar_total_w = col_w[4] - 8
                fill_w      = max(bar_total_w * pct / 100, 0)
                empty_w     = bar_total_w - fill_w
                bar_color   = TEAL if (is_top and not is_tied) else YELLOW if is_tied and is_top else colors.HexColor('#94a3b8')

                if fill_w > 0 and empty_w > 0:
                    bar = Table([['' , '']], colWidths=[fill_w, empty_w], rowHeights=[8])
                    bar.setStyle(TableStyle([
                        ('BACKGROUND',    (0, 0), (0, 0), bar_color),
                        ('BACKGROUND',    (1, 0), (1, 0), BAR_EMPTY),
                        ('TOPPADDING',    (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
                    ]))
                elif fill_w > 0:
                    bar = Table([['']], colWidths=[bar_total_w], rowHeights=[8])
                    bar.setStyle(TableStyle([
                        ('BACKGROUND',    (0, 0), (-1, -1), bar_color),
                        ('TOPPADDING',    (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
                    ]))
                else:
                    bar = Table([['']], colWidths=[bar_total_w], rowHeights=[8])
                    bar.setStyle(TableStyle([
                        ('BACKGROUND',    (0, 0), (-1, -1), BAR_EMPTY),
                        ('TOPPADDING',    (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
                    ]))

                tdata.append([
                    rank_cell,
                    Paragraph(c.name, name_style),
                    Paragraph(f'{c.vote_count:,}', STYLES['td_c']),
                    Paragraph(f'{pct:.1f}%', STYLES['td_c']),
                    bar,
                ])

            result_tbl = Table(tdata, colWidths=col_w, repeatRows=1)

            ts = [
                # Header
                ('BACKGROUND',    (0, 0), (-1, 0),  DARK),
                ('TOPPADDING',    (0, 0), (-1, 0),  7),
                ('BOTTOMPADDING', (0, 0), (-1, 0),  7),
                # Body rows
                ('TOPPADDING',    (0, 1), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
                ('LEFTPADDING',   (0, 0), (-1, -1), 5),
                ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('LINEBELOW',     (0, 0), (-1, -1), 0.3, BORDER),
            ]

            # Alternating row colors
            for ri in range(1, len(tdata)):
                c_obj  = candidates[ri - 1]
                is_top = c_obj.vote_count == top_v and top_v > 0
                if is_top and not is_tied:
                    bg = colors.HexColor('#fffbeb')
                elif ri % 2 == 0:
                    bg = LIGHT
                else:
                    bg = WHITE
                ts.append(('BACKGROUND', (0, ri), (-1, ri), bg))

            result_tbl.setStyle(TableStyle(ts))
            cat_els.append(result_tbl)

            # Winner / Tied callout
            if top_v > 0:
                cat_els.append(Spacer(1, 5))
                if is_tied:
                    names      = ', '.join(c.name for c in candidates if c.vote_count == top_v)
                    callout_tx = f'Tied:  {names} — {top_v:,} votes each'
                    cb         = colors.HexColor('#f0fdf4')
                    cl         = GREEN
                else:
                    pct_top    = (candidates[0].vote_count / total_cv * 100) if total_cv > 0 else 0
                    callout_tx = f'Winner:  {candidates[0].name} — {candidates[0].vote_count:,} votes ({pct_top:.1f}%)'
                    cb         = colors.HexColor('#fffbeb')
                    cl         = YELLOW

                callout = Table(
                    [[Paragraph(callout_tx, S('cw', fontSize=9, fontName='Helvetica-Bold', textColor=DARK, leading=13))]],
                    colWidths=[CW]
                )
                callout.setStyle(TableStyle([
                    ('BACKGROUND',    (0, 0), (-1, -1), cb),
                    ('LINEBEFORE',    (0, 0), (0, -1),  3, cl),
                    ('TOPPADDING',    (0, 0), (-1, -1), 7),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                    ('LEFTPADDING',   (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING',  (0, 0), (-1, -1), 10),
                ]))
                cat_els.append(callout)

        cat_els.append(Spacer(1, 14))
        elements.append(KeepTogether(cat_els))

    # ══════════════════════════════════════════════
    # RESULTS SUMMARY TABLE
    # ══════════════════════════════════════════════
    elements.append(HRFlowable(width=CW, thickness=0.5, color=BORDER))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph('Results Summary', STYLES['h2']))
    elements.append(Spacer(1, 4))

    sum_data = [[
        Paragraph('Category',       STYLES['th']),
        Paragraph('Winner / Outcome',STYLES['th']),
        Paragraph('Top Votes',      STYLES['th']),
        Paragraph('Share',          STYLES['th']),
        Paragraph('Total Votes',    STYLES['th']),
    ]]

    for cat in event.categories.filter(is_active=True):
        cands   = list(cat.candidates.filter(is_active=True).order_by('-vote_count'))
        total_v = sum(c.vote_count for c in cands)
        top_v   = cands[0].vote_count if cands else 0
        is_tied = (len(cands) > 1 and cands[0].vote_count == cands[1].vote_count and top_v > 0)

        if not cands or top_v == 0:
            outcome = 'No votes'
            share   = '-'
        elif is_tied:
            tied_names = ' & '.join(c.name for c in cands if c.vote_count == top_v)
            outcome    = f'Tied: {tied_names}'
            share      = f'{top_v / total_v * 100:.1f}%' if total_v else '-'
        else:
            outcome = cands[0].name
            share   = f'{top_v / total_v * 100:.1f}%' if total_v else '-'

        sum_data.append([
            Paragraph(cat.name,        STYLES['td']),
            Paragraph(outcome,         STYLES['td']),
            Paragraph(f'{top_v:,}',    STYLES['td_c']),
            Paragraph(share,           STYLES['td_c']),
            Paragraph(f'{total_v:,}',  STYLES['td_c']),
        ])

    sum_tbl = Table(sum_data, colWidths=[CW*0.22, CW*0.38, CW*0.13, CW*0.12, CW*0.15], repeatRows=1)
    sum_ts  = [
        ('BACKGROUND',    (0, 0), (-1, 0),  SLATE),
        ('TOPPADDING',    (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW',     (0, 0), (-1, -1), 0.3, BORDER),
    ]
    for ri in range(1, len(sum_data)):
        sum_ts.append(('BACKGROUND', (0, ri), (-1, ri), LIGHT if ri % 2 == 0 else WHITE))
    sum_tbl.setStyle(TableStyle(sum_ts))
    elements.append(sum_tbl)

    # ══════════════════════════════════════════════
    # FOOTER
    # ══════════════════════════════════════════════
    elements.append(Spacer(1, 16))
    elements.append(HRFlowable(width=CW, thickness=0.5, color=BORDER))
    elements.append(Spacer(1, 5))

    foot_data = [[
        Paragraph('CelerVote  ·  Secure Electronic Voting', STYLES['footer']),
        Paragraph(f'Generated: {generated_at}',             STYLES['footer']),
        Paragraph('Confidential — Authorized Use Only',     STYLES['footer']),
    ]]
    foot_tbl = Table(foot_data, colWidths=[CW/3]*3)
    foot_tbl.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(foot_tbl)

    # ── Build ──
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=LEFT,
        rightMargin=RIGHT,
        topMargin=TOP,
        bottomMargin=BOTTOM,
        title=f'{event.title} — Results',
        author='CelerVote',
    )

    def page_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(GRAY)
        canvas.drawString(LEFT, 10*mm, f'{event.title} — Results Report')
        canvas.drawRightString(W - RIGHT, 10*mm, f'Page {doc.page}')
        canvas.restoreState()

    doc.build(elements, onFirstPage=page_footer, onLaterPages=page_footer)
    buffer.seek(0)

    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{event.slug}-results.pdf"'
    return response


# ── CSV Export ────────────────────────────────────────────────────────────────

def export_results_csv(event: Event) -> HttpResponse:
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{event.slug}-results.csv"'
    writer = csv.writer(response)
    writer.writerow(['Category', 'Rank', 'Candidate', 'Votes', 'Percentage'])
    for cat in event.categories.filter(is_active=True):
        for i, c in enumerate(cat.candidates.filter(is_active=True).order_by('-vote_count'), 1):
            writer.writerow([cat.name, i, c.name, c.vote_count, f'{c.vote_percentage:.1f}%'])
    return response