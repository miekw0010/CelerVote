"""
check_overvotes.py
──────────────────
Scans the votes table for every type of overvote that can exist in this system
and prints a full report. SAFE: read-only by default. Nothing is deleted or
modified unless you pass --fix (which only fixes candidate.vote_count drift,
never deletes any vote).

Usage:
    python manage.py check_overvotes                   # report only
    python manage.py check_overvotes --event <slug>    # single event
    python manage.py check_overvotes --fix             # also repair count drift

Overvote types detected
───────────────────────
1. DUPLICATE PAYMENT REF
   Same payment_ref used more than once on any candidate.
   These are the most dangerous — means someone voted with the same Paystack
   reference twice (race condition before today's DB constraint was added).

2. SAME SESSION, SAME CATEGORY (free events)
   A voter session has more than one vote in a category where
   allow_multiple_votes=False. The session should have been blocked by
   _check_vote_limit but may have slipped through under concurrency.

3. CANDIDATE COUNT DRIFT
   candidate.vote_count doesn't match COUNT(*) of actual votes in the DB.
   This causes dashboard display errors. --fix repairs this atomically.

4. EVENT TOTAL DRIFT
   event.total_votes doesn't match actual vote count. Also repaired by --fix.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, F, Q


class Command(BaseCommand):
    help = 'Detect overvotes, duplicate payment refs, and vote count drift'

    def add_arguments(self, parser):
        parser.add_argument(
            '--event', dest='event_slug', default=None,
            help='Limit check to one event slug',
        )
        parser.add_argument(
            '--fix', action='store_true', default=False,
            help='Repair candidate.vote_count and event.total_votes drift (no votes deleted)',
        )

    def handle(self, *args, **options):
        from apps.voting.models import Vote
        from apps.events.models import Event, Candidate

        slug   = options['event_slug']
        do_fix = options['fix']

        events = Event.objects.all()
        if slug:
            events = events.filter(slug=slug)
            if not events.exists():
                self.stderr.write(self.style.ERROR(f'No event found with slug "{slug}"'))
                return

        total_issues = 0

        for event in events.order_by('title'):
            self.stdout.write(
                self.style.MIGRATE_HEADING(f'\n══ {event.title} ({event.slug}) ══')
            )
            event_votes = Vote.objects.filter(event=event)
            event_issues = 0

            # ─────────────────────────────────────────────────────────────────
            # CHECK 1: Duplicate payment refs
            # ─────────────────────────────────────────────────────────────────
            dup_refs = (
                event_votes
                .exclude(payment_ref='')
                .values('payment_ref', 'candidate')
                .annotate(count=Count('id'))
                .filter(count__gt=1)
                .order_by('-count')
            )

            if dup_refs.exists():
                self.stdout.write(self.style.ERROR(
                    f'  [CHECK 1] DUPLICATE PAYMENT REFS — {dup_refs.count()} pair(s) affected:'
                ))
                for row in dup_refs:
                    try:
                        candidate = Candidate.objects.get(id=row['candidate'])
                        cname = candidate.name
                    except Candidate.DoesNotExist:
                        cname = str(row['candidate'])
                    self.stdout.write(
                        f'    ref={row["payment_ref"]}  candidate="{cname}"  count={row["count"]}'
                    )
                    # Show the actual vote IDs so you can investigate
                    dupe_votes = event_votes.filter(
                        payment_ref=row['payment_ref'],
                        candidate=row['candidate']
                    ).values('id', 'created_at', 'ip_address', 'session_id')
                    for v in dupe_votes:
                        self.stdout.write(
                            f'      → vote_id={v["id"]}  created={v["created_at"]}  ip={v["ip_address"]}'
                        )
                event_issues += dup_refs.count()
            else:
                self.stdout.write(self.style.SUCCESS('  [CHECK 1] No duplicate payment refs ✓'))

            # ─────────────────────────────────────────────────────────────────
            # CHECK 2: Same session voted in same category more than once
            #          (only meaningful for free/non-paid events with single vote)
            # ─────────────────────────────────────────────────────────────────
            if not event.is_paid and not event.allow_multiple_votes:
                session_dupes = (
                    event_votes
                    .values('session', 'category')
                    .annotate(count=Count('id'))
                    .filter(count__gt=1)
                    .order_by('-count')
                )
                if session_dupes.exists():
                    self.stdout.write(self.style.ERROR(
                        f'  [CHECK 2] SESSION/CATEGORY DUPES — {session_dupes.count()} pair(s):'
                    ))
                    for row in session_dupes:
                        from apps.events.models import Category
                        try:
                            cat = Category.objects.get(id=row['category'])
                            cat_name = cat.name
                        except Category.DoesNotExist:
                            cat_name = str(row['category'])
                        self.stdout.write(
                            f'    session={row["session"]}  category="{cat_name}"  votes={row["count"]}'
                        )
                    event_issues += session_dupes.count()
                else:
                    self.stdout.write(self.style.SUCCESS('  [CHECK 2] No session/category dupes ✓'))
            else:
                self.stdout.write('  [CHECK 2] Skipped — paid/multi-vote event (expected multiple votes per session)')

            # ─────────────────────────────────────────────────────────────────
            # CHECK 3: Candidate vote_count drift
            # ─────────────────────────────────────────────────────────────────
            from apps.events.models import Category as Cat
            candidates_with_drift = []
            for cat in Cat.objects.filter(event=event, is_active=True):
                for cand in Candidate.objects.filter(category=cat):
                    real_count = Vote.objects.filter(candidate=cand).count()
                    if cand.vote_count != real_count:
                        candidates_with_drift.append({
                            'candidate': cand,
                            'stored': cand.vote_count,
                            'real': real_count,
                            'diff': cand.vote_count - real_count,
                        })

            if candidates_with_drift:
                self.stdout.write(self.style.WARNING(
                    f'  [CHECK 3] CANDIDATE COUNT DRIFT — {len(candidates_with_drift)} candidate(s):'
                ))
                for d in candidates_with_drift:
                    direction = 'INFLATED' if d['diff'] > 0 else 'UNDERSTATED'
                    self.stdout.write(
                        f'    "{d["candidate"].name}" — stored={d["stored"]}  actual={d["real"]}  diff={d["diff"]:+d}  [{direction}]'
                    )
                    if do_fix:
                        Candidate.objects.filter(id=d['candidate'].id).update(
                            vote_count=d['real']
                        )
                        self.stdout.write(self.style.SUCCESS(
                            f'      → Fixed: vote_count set to {d["real"]}'
                        ))
                event_issues += len(candidates_with_drift)
            else:
                self.stdout.write(self.style.SUCCESS('  [CHECK 3] All candidate vote counts accurate ✓'))

            # ─────────────────────────────────────────────────────────────────
            # CHECK 4: Event total_votes drift
            # ─────────────────────────────────────────────────────────────────
            real_total = event_votes.count()
            if event.total_votes != real_total:
                direction = 'INFLATED' if event.total_votes > real_total else 'UNDERSTATED'
                self.stdout.write(self.style.WARNING(
                    f'  [CHECK 4] EVENT TOTAL DRIFT — stored={event.total_votes}  actual={real_total}  [{direction}]'
                ))
                if do_fix:
                    Event.objects.filter(id=event.id).update(total_votes=real_total)
                    self.stdout.write(self.style.SUCCESS(
                        f'      → Fixed: event.total_votes set to {real_total}'
                    ))
                event_issues += 1
            else:
                self.stdout.write(self.style.SUCCESS(
                    f'  [CHECK 4] Event total_votes accurate ({real_total}) ✓'
                ))

            # Event summary
            if event_issues == 0:
                self.stdout.write(self.style.SUCCESS(f'  → CLEAN'))
            else:
                self.stdout.write(self.style.ERROR(f'  → {event_issues} issue(s) found'))
            total_issues += event_issues

        # Final summary
        self.stdout.write('\n' + '─' * 60)
        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS('ALL CLEAR — no overvotes or drift found.'))
        else:
            self.stdout.write(self.style.ERROR(
                f'TOTAL: {total_issues} issue(s) found across all events.'
            ))
            if not do_fix:
                self.stdout.write(
                    'Run with --fix to repair count drift (no votes are ever deleted).'
                )
