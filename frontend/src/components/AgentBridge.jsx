import { useEffect } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export default function AgentBridge() {
  useEffect(() => {
    let stop = false;

    const apply = (msg) => {
      try {
        if (!msg || typeof msg !== "object" || !msg.type) return;
        // Small whitelist to avoid accidentally emitting unrelated messages
        const allowed = new Set(["AGENT_RESULTS", "AGENT_SEARCH", "AGENT_UI", "AGENT_PING", "AGENT_LOG"]);
        if (!allowed.has(String(msg.type))) return;
        // Post to same-origin only for safety
        const target = window.location.origin || "*";
        // eslint-disable-next-line no-console
        console.debug("[AgentBridge] posting message to app:", msg.type, msg);
        window.postMessage(msg, target);
      } catch (err) {
        // swallow - this polling loop should be robust
      }
    };

    const tick = async () => {
      while (!stop) {
        try {
          const r = await fetch(`${API_BASE}/api/agent/command/`, { method: "GET", cache: "no-store" });
          if (r.ok) {
            const data = await r.json();
            // Support multiple response shapes:
            // 1) { pending: true, message: { ... } }
            // 2) { type: 'AGENT_UI', ... } (direct message)
            // 3) [ { ... }, { ... } ] (array of messages)
            if (data?.pending && data.message) {
              // Some backends include a 'pending' flag and 'message' payload.
              // Use the centralized apply() helper so messages are validated once.
              apply(data.message);
            } else if (Array.isArray(data)) {
              // multiple messages
              // eslint-disable-next-line no-console
              console.debug('[AgentBridge] received array of messages, count=', data.length);
              data.forEach((m) => apply(m));
            } else if (data && typeof data === 'object' && data.type) {
              // some backends return the message directly
              // eslint-disable-next-line no-console
              console.debug('[AgentBridge] received direct message:', data.type);
              apply(data);
            } else {
              // eslint-disable-next-line no-console
              console.debug('[AgentBridge] no message in response or unrecognized shape', data);
            }
          } else {
            // eslint-disable-next-line no-console
            console.debug('[AgentBridge] poll returned non-ok status', r.status);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.debug('[AgentBridge] poll error', err?.message || err);
        }
        await new Promise((res) => setTimeout(res, 1500)); // 1.5s poll
      }
    };

    tick();
    return () => {
      stop = true;
    };
  }, []);

  return null;
}
