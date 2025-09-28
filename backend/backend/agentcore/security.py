import os
import logging
from typing import Optional
from django.http import JsonResponse
from django.http import HttpRequest

logger = logging.getLogger(__name__)
CONVAI_TOOL_SECRET = os.environ.get("CONVAI_TOOL_SECRET", "").strip()

def verify_secret_or_401(request: HttpRequest) -> Optional[JsonResponse]:
    """
    Verify X-Convai-Secret header for webhook calls.
    If no secret is configured, allow (dev mode) but log a warning.
    """
    if not CONVAI_TOOL_SECRET:
        logger.warning("CONVAI_TOOL_SECRET not set; allowing request (dev mode).")
        return None
    if request.headers.get("X-Convai-Secret", "") != CONVAI_TOOL_SECRET:
        return JsonResponse({"error": "Unauthorized", "utterance": "Unauthorized"}, status=401)
    return None
