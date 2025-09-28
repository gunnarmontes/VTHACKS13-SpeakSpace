# voiceagent/voiceagent/views.py
from __future__ import annotations
import json
import logging
import os
from typing import Any, Dict

from django.http import JsonResponse, HttpRequest
from django.views.decorators.csrf import csrf_exempt

from .agentbus import get_bus

logger = logging.getLogger(__name__)

# Authorization: Bearer <ELEVENLABS_AGENT_BEARER>
AGENT_BEARER = os.environ.get("ELEVENLABS_AGENT_BEARER", "change-me").strip()
import os
import logging
from django.http import JsonResponse

logger = logging.getLogger(__name__)

def _auth_ok(request):
    auth = (request.headers.get("Authorization") or "").strip()
    token = (os.environ.get("ELEVENLABS_AGENT_BEARER") or "").strip()
    logger.warning("Auth header = %r, expected = %r", auth, f"Bearer {token}")
    # Accept either "Bearer <token>" or just "<token>"
    return auth == f"Bearer {token}" or auth == token

@csrf_exempt
def agent_route(request):
    if request.method != "POST":
        return JsonResponse({"detail": "POST required"}, status=405)

    if not _auth_ok(request):
        logger.warning("Unauthorized webhook call to agent_route")
        return JsonResponse({"detail": "unauthorized"}, status=401)

    try:
        body: Dict[str, Any] = json.loads(request.body or "{}")
        utterance = (body.get("utterance") or "").strip()
        if not utterance:
            return JsonResponse({"summary": "What location should I search? You can say a ZIP or a city."})

        result = get_bus().route(utterance)
        if not isinstance(result, dict):
            result = {"summary": "Sorry, something went wrong handling your request."}

        logger.info("agent_route handled utterance=%r -> %s", utterance, result.get("summary"))
        return JsonResponse(result)

    except Exception as e:
        logger.exception("agent_route error: %s", e)
        return JsonResponse(
            {"summary": "I ran into a problem handling that request."},
            status=500,
        )
