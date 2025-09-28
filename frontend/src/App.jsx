// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { connectAgentSocket } from "./lib/agentSocket";

export default function App() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);

  const showToast = (msg, ms = 2000) => {
    setToast(msg);
    if (ms) setTimeout(() => setToast(null), ms);
  };

  useEffect(() => {
    wsRef.current = connectAgentSocket((payload) => {
      if (payload?.type === "navigate" && payload?.url) {
        navigate(payload.url);
        showToast("Loading results…");
      }
    });
    return () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [navigate]);

  return (
    <div>
      {toast && (
        <div style={{
          position: "fixed", top: 12, right: 12, padding: "8px 12px",
          background: "#111", color: "white", borderRadius: 8, opacity: 0.9
        }}>
          {toast}
        </div>
      )}
      <Outlet />
    </div>
  );
}
