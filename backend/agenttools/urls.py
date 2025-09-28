from django.urls import path
from .views import convai_tool_router, tools_echo

urlpatterns = [
    path("agent/tools/", convai_tool_router, name="convai_tool_router"),
    path("agent/tools/echo/", tools_echo, name="convai_tools_echo"),
]
