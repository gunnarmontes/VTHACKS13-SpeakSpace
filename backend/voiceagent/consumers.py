# voiceagent/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer

class AgentBroadcastConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("agent_broadcast", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("agent_broadcast", self.channel_name)

    # MUST match "type": "agent_event"
    async def agent_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
