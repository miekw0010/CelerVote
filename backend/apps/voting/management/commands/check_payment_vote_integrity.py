"""
Management command: check_payment_vote_integrity

Run with: python manage.py check_payment_vote_integrity

Checks every successful Payment record against actual Vote rows cast for
that reference. Reports any payment where:
  - more votes were cast than paid for (overvoted — duplicate bug)
  - fewer votes were cast than paid for (undervoted — missing/blocked vote)

Exit code is non-zero if any mismatch is found, so this can be wired into
a scheduled job / cron / Railway cron service and alert on failure.

Usage:
    python manage.py check_payment_vote_integrity
    python manage.py check_payment_vote_integrity --hours 24   # only check recent payments
    python manage.py check_payment_vote_integrity --fix        # auto-create missing votes for undervoted refs
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from django.core.cache import cache


class Command(BaseCommand):
    help = 'Check for payment/vote count mismatches (duplicates or missing votes)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours', type=int, default=None,
            help='Only check payments created in the last N hours (default: all time)',
        )
        parser.add_argument(
            '--fix', action='store_true',
            help='Automatically create missing votes for undervoted refs (does NOT touch overvoted refs)',
        )

    def handle(self, *args, **options):
        from apps.payments.models import Payment
        from apps.voting.models import Vote, VoteSession
        from apps.events.models import Candidate, Category, Event
        from apps.voting.services import encrypt_vote_data

        qs = Payment.objects.filter(status='success', votes_bought__gte=1)
        if options['hours']:
            since = timezone.now() - timedelta(hours=options['hours'])
            qs = qs.filter(created_at__gte=since)
            self.stdout.write(f"Checking payments from the last {options['hours']} hours...")
        else:
            self.stdout.write("Checking all successful payments...")

        overvoted  = []
        undervoted = []
        exact      = 0

        for p in qs:
            actual   = Vote.objects.filter(payment_ref=p.reference).count()
            paid_for = p.votes_bought or 1
            if actual > paid_for:
                overvoted.append((p, actual, paid_for))
            elif actual < paid_for:
                undervoted.append((p, actual, paid_for))
            else:
                exact += 1

        self.stdout.write(f"\nChecked {qs.count()} payments")
        self.stdout.write(self.style.SUCCESS(f"Exact matches: {exact}"))

        if overvoted:
            self.stdout.write(self.style.ERROR(f"\nOVERVOTED (duplicate votes): {len(overvoted)}"))
            for p, actual, paid_for in overvoted:
                self.stdout.write(
                    self.style.ERROR(f"  {p.reference}: cast={actual} paid_for={paid_for} excess={actual-paid_for}")
                )
        else:
            self.stdout.write(self.style.SUCCESS("No overvoted refs found."))

        if undervoted:
            self.stdout.write(self.style.WARNING(f"\nUNDERVOTED (missing votes): {len(undervoted)}"))
            total_missing = 0
            for p, actual, paid_for in undervoted:
                missing = paid_for - actual
                total_missing += missing
                self.stdout.write(
                    self.style.WARNING(f"  {p.reference}: cast={actual} paid_for={paid_for} missing={missing}")
                )
            self.stdout.write(self.style.WARNING(f"Total votes missing: {total_missing}"))

            if options['fix']:
                self.stdout.write("\n--fix flag set: creating missing votes now...")
                affected_cand_ids  = set()
                affected_event_ids = set()
                created_total      = 0
                skipped            = []

                with transaction.atomic():
                    for p, actual, paid_for in undervoted:
                        missing = paid_for - actual
                        if not p.category_id or not p.candidate_id:
                            skipped.append((p.reference, 'no category/candidate on Payment record'))
                            continue
                        try:
                            category  = Category.objects.get(id=p.category_id)
                            candidate = Candidate.objects.get(id=p.candidate_id, category=category)
                        except Exception:
                            skipped.append((p.reference, 'category/candidate no longer exists'))
                            continue

                        event = category.event
                        existing = Vote.objects.filter(payment_ref=p.reference).first()
                        if existing:
                            session = existing.session
                        else:
                            session, _ = VoteSession.objects.get_or_create(
                                event=event, ip_address='127.0.0.1',
                                device_fingerprint=f'auto_fix:{p.reference}',
                                defaults={'voter_phone': p.phone, 'voter_email': p.email, 'votes_cast': 0},
                            )

                        new_votes = []
                        for _ in range(missing):
                            enc = encrypt_vote_data({
                                'event_id': str(event.id), 'category_id': str(category.id),
                                'candidate_id': str(candidate.id), 'voter_id': None,
                                'timestamp': timezone.now().isoformat(), 'ip': '127.0.0.1',
                                'auto_recovered': True,
                                'reason': 'check_payment_vote_integrity --fix',
                            })
                            new_votes.append(Vote(
                                session=session, event=event, category=category, candidate=candidate,
                                encrypted_data=enc, payment_ref=p.reference, is_paid=True,
                                ip_address='127.0.0.1',
                            ))
                        Vote.objects.bulk_create(new_votes)
                        created_total += len(new_votes)
                        affected_cand_ids.add(candidate.id)
                        affected_event_ids.add(event.id)
                        session.votes_cast = Vote.objects.filter(session=session).count()
                        session.save(update_fields=['votes_cast'])

                    for cid in affected_cand_ids:
                        real = Vote.objects.filter(candidate_id=cid).count()
                        Candidate.objects.filter(id=cid).update(vote_count=real)
                    for eid in affected_event_ids:
                        tot = Vote.objects.filter(event_id=eid).count()
                        Event.objects.filter(id=eid).update(total_votes=tot)

                cache.clear()
                self.stdout.write(self.style.SUCCESS(f"Created {created_total} votes."))
                if skipped:
                    self.stdout.write(self.style.WARNING(f"Skipped {len(skipped)}:"))
                    for ref, reason in skipped:
                        self.stdout.write(f"  {ref}: {reason}")
        else:
            self.stdout.write(self.style.SUCCESS("No undervoted refs found."))

        if overvoted or undervoted:
            raise SystemExit(1)  # non-zero exit so cron/CI can alert on failure
