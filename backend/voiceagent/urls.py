# backend/voiceagent/urls.py
from django.urls import path
from .views import agent_view

urlpatterns = [
    # Final path will be /api/voice/agent/ because we include this under "api/" in the project urls
    path("voice/agent/", agent_view, name="voice_agent"),
]
