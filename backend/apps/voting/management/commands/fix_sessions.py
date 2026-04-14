from django.core.management.base import BaseCommand
from apps.voting.models import VoteSession

class Command(BaseCommand):
    help = 'Reset anonymous vote sessions after fingerprint security fix'

    def handle(self, *args, **kwargs):
        deleted, _ = VoteSession.objects.filter(
            voter__isnull=True,
            event__is_paid=False,
            event__voting_mode='open',
        ).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} anonymous sessions.'))