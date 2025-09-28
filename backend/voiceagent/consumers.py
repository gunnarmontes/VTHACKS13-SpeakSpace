# backend/voiceagent/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json

class AgentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # For now, accept everyone (add auth later if needed)
        await self.accept()
        await self.send_json({
            "type": "welcome",
            "message": "WebSocket connected. Batch agent is available via POST /api/voice/agent/."
        })

    async def receive(self, text_data=None, bytes_data=None):
        # Minimal echo / stub behavior
        try:
            payload = json.loads(text_data) if text_data else {}
        except Exception:
            payload = {"raw": text_data}

        # You could trigger your batch flow here, but WS streaming is a later step.
        await self.send_json({
            "type": "echo",
            "received": payload,
            "hint": "Use POST /api/voice/agent/ for batch speech flow."
        })

    async def disconnect(self, code):
        # Clean up if needed
        return

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))
