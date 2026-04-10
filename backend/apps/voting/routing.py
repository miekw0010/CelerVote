from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/results/(?P<slug>[\w-]+)/$', consumers.VoteResultsConsumer.as_asgi()),
]