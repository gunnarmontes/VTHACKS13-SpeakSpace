# backend/voiceagent/urls.py
from django.urls import path
from .views import agent_route

urlpatterns = [
    path("agent/route/", agent_route),
]
