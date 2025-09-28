# voiceagent/voiceagent/agentbus.py
"""
Agent Bus: minimal router + pluggable agents.
Broadcasts UI events to /ws/agent/ group.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, List, Dict, Any, Optional
import os
import re
import requests
import logging

logger = logging.getLogger(__name__)

class ToolAgent(Protocol):
    name: str
    def can_handle(self, text: str) -> bool: ...
    def handle(self, text: str) -> Dict[str, Any]: ...

def _public_base_url() -> str:
    base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if not base:
        base = "http://127.0.0.1:8000"
    return base

def _broadcast(payload: Dict[str, Any]) -> None:
    try:
        from channels.layers import get_channel_layer  # type: ignore
        from asgiref.sync import async_to_sync         # type: ignore
    except Exception:
        return
    layer = get_channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        "agent_broadcast",
        {"type": "agent_event", "payload": payload},
    )

def _extract_zip_or_text(text: str) -> str:
    m = re.search(r"\b(\d{5})\b", text)
    return m.group(1) if m else text.strip()

class PropertiesSearchAgent:
    name = "properties.search"

    def can_handle(self, text: str) -> bool:
        t = text.lower()
        return any(k in t for k in (
            "apartment", "apartments", "condo", "house", "homes",
            "listings", "properties", "zip"
        ))

    def handle(self, text: str) -> Dict[str, Any]:
        q = _extract_zip_or_text(text)
        base = _public_base_url()
        url = f"{base}/api/properties/search/"

        headers: Dict[str, str] = {}
        # Optional: if you later protect the search API
        search_bearer = os.environ.get("SEARCH_API_BEARER", "").strip()
        if search_bearer:
            headers["Authorization"] = f"Bearer {search_bearer}"

        try:
            r = requests.get(
                url,
                params={"mode": "text", "q": q},
                headers=headers or None,
                timeout=15,
            )
            try:
                data = r.json() if r.status_code == 200 else {"results": []}
            except Exception:
                data = {"results": []}
            logger.info("search GET %s -> %s", r.url, r.status_code)
        except Exception as e:
            logger.exception("search request failed: %s", e)
            data = {"results": []}

        items = data.get("results", []) or []
        count = len(items)

        _broadcast({"type": "navigate", "url": f"/dashboard?mode=text&q={q}"})
        return {"summary": f"I found {count} places for {q}.", "count": count}

class NearbyAgent:
    name = "places.nearby"

    def can_handle(self, text: str) -> bool:
        t = text.lower()
        return any(k in t for k in ("nearby", "around here", "close by", "this area"))

    def handle(self, text: str) -> Dict[str, Any]:
        return {"summary": "Okay—use the current map view to search this area."}

@dataclass
class Router:
    agents: List[ToolAgent]

    def route(self, text: str) -> Dict[str, Any]:
        t = (text or "").strip()
        if not t:
            return {"summary": "What location should I search? You can say a ZIP or a city."}
        for agent in self.agents:
            try:
                if agent.can_handle(t):
                    return agent.handle(t)
            except Exception as e:
                logger.exception("Agent %s failed: %s", getattr(agent, "name", agent.__class__.__name__), e)
                return {"summary": "Something went wrong handling your request."}
        return {"summary": "I can help find apartments or places nearby. Try a ZIP like 24060."}

_BUS: Optional[Router] = None
def get_bus() -> Router:
    global _BUS
    if _BUS is None:
        _BUS = Router(agents=[PropertiesSearchAgent(), NearbyAgent()])
    return _BUS
