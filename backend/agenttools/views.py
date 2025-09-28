import json
import logging
from typing import Dict, Any

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET

from backend.agentcore.http import api_get
from backend.agentcore.security import verify_secret_or_401

logger = logging.getLogger(__name__)

def _ok(data: Dict[str, Any], utterance: str = "") -> JsonResponse:
    return JsonResponse({"data": data, "utterance": utterance})

def _bad_request(msg: str, code: int = 400) -> JsonResponse:
    return JsonResponse({"error": msg, "utterance": msg}, status=code)

# -------------------- Tool implementations --------------------

def tool_search_text(params: Dict[str, Any]) -> JsonResponse:
    """
    Input:  { "tool": "search.text", "params": { "q": "Norfolk, VA" } }
    Calls:  GET /api/properties/search/?mode=text&q=...
    """
    q = (params.get("q") or "").strip()
    if not q:
        return _bad_request("Please provide a city or ZIP (e.g., 'Norfolk, VA' or '24060').")

    try:
        resp = api_get("/api/properties/search/", params={"mode": "text", "q": q})
        resp.raise_for_status()
        payload = resp.json()
        results = payload.get("results", [])
        say = f"I found {len(results)} places near {q}. Showing them now." if results \
              else f"I couldn’t find places near {q}. Try another location."
        return _ok(
            {"results": results, "params": {"mode": "text", "q": q}, "navigate": f"/dashboard?mode=text&q={q}"},
            say
        )
    except Exception as e:
        logger.exception("tool_search_text failed")
        return _bad_request(f"Search failed upstream: {e}", code=502)

def tool_search_nearby(params: Dict[str, Any]) -> JsonResponse:
    """
    Input:  { "tool": "search.nearby", "params": { "sw": "lat,lng", "ne": "lat,lng" } }
    Calls:  GET /api/properties/search/?mode=nearby&sw=...&ne=...
    """
    sw = (params.get("sw") or "").strip()
    ne = (params.get("ne") or "").strip()
    if not sw or not ne:
        return _bad_request("Please provide map bounds: 'sw' and 'ne' as 'lat,lng'.")

    try:
        resp = api_get("/api/properties/search/", params={"mode": "nearby", "sw": sw, "ne": ne})
        resp.raise_for_status()
        payload = resp.json()
        results = payload.get("results", [])
        say = f"I found {len(results)} places in the current map area." if results else "No places in the current map area."
        return _ok(
            {"results": results, "params": {"mode": "nearby", "sw": sw, "ne": ne}, "navigate": f"/dashboard?mode=nearby&sw={sw}&ne={ne}"},
            say
        )
    except Exception as e:
        logger.exception("tool_search_nearby failed")
        return _bad_request(f"Nearby search failed upstream: {e}", code=502)

def tool_finance_affordability(params: Dict[str, Any]) -> JsonResponse:
    """
    Optional example tool: compute a recommended rent range inline.
    Input: { "tool": "finance.affordability", "params": { "incomeMonthly": 4000, "fixedDebtsMonthly": 300, "targetSavingsMonthly": 400 } }
    """
    try:
        inc = float(params.get("incomeMonthly") or 0)
        debts = float(params.get("fixedDebtsMonthly") or 0)
        savings = float(params.get("targetSavingsMonthly") or 0)

        thirty = 0.30 * inc
        dti_cap = max(0.0, 0.36 * inc - debts)
        after_goal = max(0.0, inc - debts - savings)
        rec_max = max(0.0, min(thirty, dti_cap, after_goal))
        rec_min = 0.8 * rec_max

        say = f"I recommend a rent of ${rec_min:,.0f}–${rec_max:,.0f} per month."
        return _ok({"recommended": [round(rec_min), round(rec_max)]}, say)
    except Exception as e:
        return _bad_request(f"Affordability error: {e}", code=400)

# Central registry for tools
TOOL_REGISTRY = {
    "search.text": tool_search_text,
    "search.nearby": tool_search_nearby,
    "finance.affordability": tool_finance_affordability,
}

@csrf_exempt
@require_POST
def convai_tool_router(request):
    """
    POST /api/agent/tools/
    Headers:
      Content-Type: application/json
      X-Convai-Secret: <shared secret>   # if configured

    Body examples:
      { "tool": "search.text", "params": { "q": "Norfolk, VA" } }
      { "tool": "search.nearby", "params": { "sw": "36.85,-76.33", "ne": "36.90,-76.20" } }

    Response:
      { "data": {...}, "utterance": "short phrase to speak" }
    """
    auth_err = verify_secret_or_401(request)
    if auth_err:
        return auth_err

    try:
        body = json.loads(request.body.decode("utf-8"))
    except Exception:
        return _bad_request("Invalid JSON body.")

    tool = (body.get("tool") or "").strip()
    params = body.get("params") or {}

    if tool not in TOOL_REGISTRY:
        return _bad_request(f"Unknown tool '{tool}'. Available: {', '.join(TOOL_REGISTRY.keys())}")

    logger.info("tool_call name=%s params=%s", tool, params)
    handler = TOOL_REGISTRY[tool]
    return handler(params)

@require_GET
def tools_echo(request):
    auth_err = verify_secret_or_401(request)
    if auth_err:
        return auth_err
    return JsonResponse({"ok": True, "utterance": "Tools echo is alive."})
