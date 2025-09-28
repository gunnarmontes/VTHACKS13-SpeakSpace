# voiceagent/routing.py
from django.urls import re_path
from .consumers import AgentBroadcastConsumer

websocket_urlpatterns = [
    re_path(r"^ws/agent/$", AgentBroadcastConsumer.as_asgi()),
]
