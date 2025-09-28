// src/components/AgentBridge.jsx
import { useEffect } from "react";
import { startAgentSocket } from "../lib/agentSocket";

export default function AgentBridge() {
  useEffect(() => {
    const stop = startAgentSocket();
    return () => stop && stop();
  }, []);
  return null;
}
