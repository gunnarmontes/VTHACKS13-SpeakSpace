# backend/voiceagent/views.py
import os
import base64
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


ELEVEN_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
# Replace with your preferred ElevenLabs voice_id
ELEVEN_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL").strip()

# If you test via Vercel/production API instead of local, set this env var:
# e.g. ELEVEN_AGENT_SEARCH_BASE_URL=https://your-app.vercel.app
SEARCH_BASE = os.environ.get("ELEVEN_AGENT_SEARCH_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _missing_env_error():
    missing = []
    if not ELEVEN_API_KEY:
        missing.append("ELEVENLABS_API_KEY")
    if not ELEVEN_VOICE_ID:
        missing.append("ELEVENLABS_VOICE_ID")
    if missing:
        return JsonResponse(
            {"error": f"Missing environment variables: {', '.join(missing)}"},
            status=500,
        )
    return None


def transcribe_audio(file_obj) -> str:
    """Send audio file to ElevenLabs STT and return transcribed text."""
    resp = requests.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers={"xi-api-key": ELEVEN_API_KEY},
        files={"file": file_obj},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    return (data.get("text") or "").strip()


def text_to_speech(text: str) -> str:
    """Send text to ElevenLabs TTS and return base64-encoded MP3 (safe for JSON)."""
    resp = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE_ID}",
        headers={
            "xi-api-key": ELEVEN_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "text": text,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
        },
        timeout=30,
    )
    resp.raise_for_status()
    # Encode binary audio into base64 so we can send via JSON easily
    return base64.b64encode(resp.content).decode("utf-8")


def property_search_http(query: str) -> dict:
    """
    Calls your existing PropertySearch API in text mode:
    GET /api/properties/search/?mode=text&q=<query>
    """
    resp = requests.get(
        f"{SEARCH_BASE}/api/properties/search/",
        params={"mode": "text", "q": query},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


@csrf_exempt
@require_POST
def agent_view(request):
    """
    POST /api/voice/agent/

    Form-data:
      - audio: recorded audio/webm (or wav/mp3)

    Response JSON:
      {
        "query": "<transcribed text>",
        "results": [...],               // normalized property list from your API
        "response_text": "<what agent said>",
        "response_audio": "<base64 mp3>" // may be null if TTS failed
      }
    """
    # Basic env checks
    missing = _missing_env_error()
    if missing:
        return missing

    if "audio" not in request.FILES:
        return JsonResponse({"error": "No audio file provided (field name 'audio')"}, status=400)

    # 1) STT – transcribe speech
    try:
        query_text = transcribe_audio(request.FILES["audio"])
    except requests.RequestException as e:
        return JsonResponse({"error": f"STT failed: {e}"}, status=502)

    # 2) Call your existing PropertySearch API
    try:
        payload = property_search_http(query_text or "apartments")
        results = payload.get("results", [])
    except requests.RequestException as e:
        return JsonResponse(
            {"query": query_text, "results": [], "error": f"Search failed: {e}"},
            status=502,
        )

    # 3) Build spoken response
    if results:
        # Try to use the first result's city name if present; otherwise echo the query
        city_guess = None
        r0 = results[0] if isinstance(results, list) and results else None
        if isinstance(r0, dict):
            city_guess = r0.get("city") or r0.get("locality") or r0.get("address")
        where = (city_guess or query_text or "your area").strip()
        response_text = f"I found {len(results)} places near {where}. Showing them now."
    else:
        response_text = f"Sorry, I couldn’t find apartments near {query_text or 'that query'}. Try another city or zip."

    # 4) TTS – synthesize speech (don’t fail the whole request if TTS errors)
    response_audio_b64 = None
    try:
        response_audio_b64 = text_to_speech(response_text)
    except requests.RequestException as e:
        # partial success—frontend can still show results and text
        return JsonResponse(
            {
                "query": query_text,
                "results": results,
                "response_text": response_text,
                "response_audio": None,
                "tts_error": str(e),
            },
            status=206,
        )

    return JsonResponse(
        {
            "query": query_text,
            "results": results,
            "response_text": response_text,
            "response_audio": response_audio_b64,
        }
    )
