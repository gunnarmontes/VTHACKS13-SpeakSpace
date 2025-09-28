import { useEffect } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export default function AgentBridge() {
  useEffect(() => {
    let stop = false;

    const apply = (msg) => {
      if (!msg || !msg.type) return;

      // Pass everything into the app the same way we already handle it in Dashboard.jsx
      window.postMessage(msg, "*");
    };

    const tick = async () => {
      while (!stop) {
        try {
          const r = await fetch(`${API_BASE}/api/agent/command/`, { method: "GET", cache: "no-store" });
          if (r.ok) {
            const data = await r.json();
            if (data?.pending && data.message) apply(data.message);
          }
        } catch {}
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
