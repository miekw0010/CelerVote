import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Max concurrent WebSocket connections per event slug
# Prevents memory exhaustion from connection flooding
WS_MAX_CONNECTIONS_PER_EVENT = 500


class VoteResultsConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.slug       = self.scope['url_route']['kwargs']['slug']
        self.group_name = f'results_{self.slug}'

        # Check connection limit before accepting
        conn_key   = f'ws_conn_count:{self.slug}'
        conn_count = cache.get(conn_key, 0)
        if conn_count >= WS_MAX_CONNECTIONS_PER_EVENT:
            logger.warning(f'WS connection limit reached for event {self.slug} ({conn_count} connections)')
            await self.close(code=4029)
            return

        event = await self.get_event(self.slug)
        if not event:
            await self.close()
            return

        # Increment connection counter (expires in 2h as safety net)
        cache.set(conn_key, conn_count + 1, timeout=7200)
        self.conn_key = conn_key

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        results = await self.get_results(self.slug)
        await self.send(text_data=json.dumps({'type': 'initial_results', 'data': results}))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        # Decrement connection counter
        if hasattr(self, 'conn_key'):
            current = cache.get(self.conn_key, 0)
            if current > 0:
                cache.set(self.conn_key, current - 1, timeout=7200)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except Exception:
            pass

    async def vote_update(self, event):
        await self.send(text_data=json.dumps({'type': 'vote_update', 'data': event['data']}))

    @database_sync_to_async
    def get_event(self, slug):
        from apps.events.models import Event
        try:
            return Event.objects.get(slug=slug)
        except Event.DoesNotExist:
            return None

    @database_sync_to_async
    def get_results(self, slug):
        from apps.events.models import Event
        from apps.voting.services import get_live_results
        try:
            event = Event.objects.get(slug=slug)
            return get_live_results(str(event.id))
        except Event.DoesNotExist:
            return {}