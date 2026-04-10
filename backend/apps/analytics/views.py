from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from apps.events.models import Event


class ExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        event = get_object_or_404(Event, slug=slug)

        if event.organizer != request.user and request.user.role != 'superadmin':
            return Response({'error': 'Permission denied'}, status=403)

        export_format = request.query_params.get('format', 'pdf')

        if export_format == 'pdf':
            from .services import export_results_pdf
            return export_results_pdf(event)
        elif export_format == 'csv':
            from .services import export_results_csv
            return export_results_csv(event)
        else:
            return Response({'error': 'Invalid format. Use pdf or csv'}, status=400)