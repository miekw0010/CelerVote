from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from apps.events.models import Event
from .tasks import notify_event_results_task, send_event_reminder_task, send_custom_message_task


class PublishResultsView(APIView):
    """Admin publishes results and notifies all voters by email."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        event.results_visible = True
        event.save(update_fields=['results_visible'])
        notify_event_results_task.delay(str(event.id))
        return Response({'message': 'Results published and voters are being notified!'})


class SendReminderView(APIView):
    """Admin sends a voting reminder to all participants."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        send_event_reminder_task.delay(str(event.id))
        return Response({'message': 'Reminders are being sent to all voters!'})


class SendCustomMessageView(APIView):
    """Admin sends a custom message to all voters of an event."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        event = get_object_or_404(Event, slug=slug)
        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        message = request.data.get('message', '').strip()
        subject = request.data.get('subject', '').strip()

        if not message:
            return Response({'error': 'Message is required.'}, status=400)
        if not subject:
            subject = f'Message from {event.title}'

        send_custom_message_task.delay(str(event.id), subject, message)
        return Response({'message': 'Custom message is being sent to all voters!'})