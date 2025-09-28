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
}// src/lib/agentSocket.js
const ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const TOKEN = import.meta.env.VITE_AGENT_BEARER || "";

function wsUrl() {
  if (!ORIGIN) return "";
  const u = new URL(ORIGIN);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  const qs = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : "";
  return `${u.toString().replace(/\/+$/, "")}/ws/agent/${qs}`;
}

export function startAgentSocket() {
  if (!ORIGIN) return () => {};
  let ws;
  let closed = false;
  const connect = () => {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => { try { ws.send(JSON.stringify({ type: "ping" })); } catch {} };
    ws.onmessage = (e) => { try { window.postMessage(JSON.parse(e.data), "*"); } catch {} };
    ws.onclose = () => { if (!closed) setTimeout(connect, 1200); };
    ws.onerror = () => {};
  };
  connect();
  return () => { closed = true; try { ws && ws.close(); } catch {} };
}

export const agent = {
  searchText(q) {
    const u = wsUrl();
    if (!u) return;
    const s = new WebSocket(u);
    s.onopen = () => {
      s.send(JSON.stringify({ type: "tool.search", params: { mode: "text", q } }));
      setTimeout(() => s.close(), 150);
    };
  },
  searchNearby(sw, ne) {
    const u = wsUrl();
    if (!u) return;
    const s = new WebSocket(u);
    s.onopen = () => {
      s.send(JSON.stringify({ type: "tool.search", params: { mode: "nearby", sw, ne } }));
      setTimeout(() => s.close(), 150);
    };
  },
};

