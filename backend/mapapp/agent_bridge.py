# mapapp/agent_bridge.py
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

_KEY = "agent_ui_command"  # single-slot mailbox

class AgentCommandView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # no JWT, no CSRF

    def get(self, request):
        msg = cache.get(_KEY)
        if not msg:
            return Response({"pending": False})
        cache.delete(_KEY)
        return Response({"pending": True, "message": msg})

    def post(self, request):
        # Expect JSON: { "type":"AGENT_UI", "action":"...", "payload":{...} } or { "type":"AGENT_RESULTS", ... }
        msg = request.data or {}
        if not isinstance(msg, dict) or "type" not in msg:
            return Response({"ok": False, "error": "Invalid message"}, status=400)
        cache.set(_KEY, msg, timeout=30)  # 30s TTL
        return Response({"ok": True})
