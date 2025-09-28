// src/lib/agentSocket.js
// Derive WS endpoint from VITE_API_URL so it works with ngrok or local dev
export function connectAgentSocket(onMessage) {
  const rawBase = import.meta.env.VITE_API_URL || window.location.origin;
  const base = rawBase.replace(/\/$/, "");
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  const url = `${wsProto}://${host}/ws/agent/`;
  const ws = new WebSocket(url);

  ws.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      if (onMessage) onMessage(payload);
    } catch (e) {
      console.warn("Agent WS parse error", e);
    }
  };
  ws.onclose = () => setTimeout(() => connectAgentSocket(onMessage), 2000);
  return ws;
}
