// src/pages/Voice.jsx
import { useEffect, useRef, useState } from "react";

export default function VoiceLive() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    // The widget tag is already on the page (index.html or this component’s JSX)
    // When opened, set an attribute the widget understands (depends on your agent’s UI settings).
    const el = document.querySelector("elevenlabs-convai");
    if (!el) return;
    if (opened) {
      el.setAttribute("open", "true"); // many builds support open/close attr
    } else {
      el.removeAttribute("open");
    }
  }, [opened]);

  return (
    <main style={{ padding: 16 }}>
      <h2>Voice Agent</h2>
      <button onClick={() => setOpened((s) => !s)}>
        {opened ? "Stop" : "Start"} talking
      </button>

      {/* You can also place the widget tag here to localize it to this page */}
      <elevenlabs-convai agent-id="YOUR_AGENT_ID"></elevenlabs-convai>
    </main>
  );
}
