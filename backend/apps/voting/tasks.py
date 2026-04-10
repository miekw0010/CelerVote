from celery import shared_task
from django.db.models import Sum
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


@shared_task
def recalculate_percentages_task(category_id: str):
    from apps.events.models import Category, Candidate
    try:
        category   = Category.objects.get(id=category_id)
        candidates = Candidate.objects.filter(category=category, is_active=True)
        total      = candidates.aggregate(t=Sum('vote_count'))['t'] or 0
        for c in candidates:
            pct = round((c.vote_count / total) * 100, 2) if total > 0 else 0.0
            Candidate.objects.filter(id=c.id).update(vote_percentage=pct)
    except Exception as e:
        print(f'recalculate_percentages_task error: {e}')


@shared_task
def broadcast_results_task(event_id: str):
    from apps.events.models import Event
    from apps.voting.services import get_live_results
    from django.core.cache import cache
    try:
        event = Event.objects.get(id=event_id)
        cache.delete(f'live_results:{event_id}')
        results       = get_live_results(event_id)
        channel_layer = get_channel_layer()
        group_name    = f'results_{event.slug}'
        async_to_sync(channel_layer.group_send)(group_name, {
            'type': 'vote_update',
            'data': results,
        })
    except Exception as e:
        print(f'broadcast_results_task error: {e}')