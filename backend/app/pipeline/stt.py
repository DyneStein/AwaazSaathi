"""Speech-to-text. Primary: Groq whisper-large-v3 (language=ur so Punjabi also comes back in Urdu script).
Fallback: Gemini audio understanding. Offline: returns None and the UI offers typed / canned input."""
import base64
import time

import httpx

from .. import config, state
from . import cache


def _groq(audio: bytes, filename: str, mime: str) -> str:
    r = httpx.post(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        files={"file": (filename, audio, mime)},
        data={"model": config.GROQ_STT_MODEL, "language": "ur", "response_format": "json",
              "prompt": "کسان اپنی فصل گندم، کپاس، مونجی، کماد یا مکئی کے بارے میں سوال پوچھ رہا ہے۔"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json().get("text", "").strip()


def _gemini(audio: bytes, mime: str) -> str:
    body = {"contents": [{"parts": [
        {"text": "Transcribe this Pakistani farmer's speech (Urdu or Punjabi) exactly, in Urdu script. Output only the transcript."},
        {"inline_data": {"mime_type": mime.split(";")[0], "data": base64.b64encode(audio).decode()}},
    ]}]}
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_TEXT_MODEL}:generateContent",
        params={"key": config.GEMINI_API_KEY}, json=body, timeout=25,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def transcribe(audio: bytes, filename: str = "q.webm", mime: str = "audio/webm") -> tuple[str | None, str]:
    """Returns (transcript, engine)."""
    k = cache.key("stt", audio)
    hit = cache.get(k)
    if hit:
        return hit["text"], hit["engine"] + " (cached)"
    if state.is_offline():
        return None, "offline"
    for name, fn in (("groq-whisper", lambda: _groq(audio, filename, mime)), ("gemini-audio", lambda: _gemini(audio, mime))):
        if (name == "groq-whisper" and not config.GROQ_API_KEY) or (name == "gemini-audio" and not config.GEMINI_API_KEY):
            continue
        t0 = time.time()
        try:
            text = fn()
            state.mark("stt", True, name, int((time.time() - t0) * 1000))
            if text:
                cache.put(k, {"text": text, "engine": name})
                return text, name
        except Exception as e:  # noqa: BLE001
            state.mark("stt", False, f"{name}: {e}")
    return None, "failed"
