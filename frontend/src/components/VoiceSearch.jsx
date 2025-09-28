import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function VoiceSearch() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  async function handleRecord() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    let chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const res = await fetch("http://127.0.0.1:8000/voice/agent/", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setQuery(data.query);

      // 🔊 Play back response audio
      const audioBytes = Uint8Array.from(atob(data.response_audio), (c) =>
        c.charCodeAt(0)
      );
      const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      new Audio(audioUrl).play();

      // 🔹 Navigate to dashboard with mode+q
      navigate(`/dashboard?mode=text&q=${encodeURIComponent(data.query)}`);
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 4000); // record 4s
  }

  return (
    <div>
      <button onClick={handleRecord}>🎤 Speak</button>
      <p>User said: {query}</p>
    </div>
  );
}
