"""Test every external service with a tiny real call. Run: cd backend && uv run python ../scripts/check_keys.py"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import httpx  # noqa: E402

from app import config  # noqa: E402

ok = True


def check(name, fn):
    global ok
    t0 = time.time()
    try:
        detail = fn()
        print(f"  PASS  {name:<28} {int((time.time() - t0) * 1000)} ms  {detail}")
    except Exception as e:  # noqa: BLE001
        ok = False
        msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            msg = f"{e.response.status_code}: {e.response.text[:200]}"
        print(f"  FAIL  {name:<28} {msg}")


def gemini():
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY missing in .env")
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_TEXT_MODEL}:generateContent",
                   params={"key": config.GEMINI_API_KEY}, timeout=20,
                   json={"contents": [{"parts": [{"text": "Reply with one Urdu word for wheat."}]}]})
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()[:40]


def groq_llm():
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY missing in .env")
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions", timeout=20,
                   headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                   json={"model": config.GROQ_TEXT_MODEL, "messages": [{"role": "user", "content": "Say OK"}]})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"][:40]


def azure_tts():
    if not config.AZURE_SPEECH_KEY:
        raise RuntimeError("AZURE_SPEECH_KEY missing in .env")
    r = httpx.post(f"https://{config.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1", timeout=20,
                   headers={"Ocp-Apim-Subscription-Key": config.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml",
                            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "awaazsaathi"},
                   content=f"<speak version='1.0' xml:lang='ur-PK'><voice name='{config.AZURE_TTS_VOICE}'>السلام علیکم</voice></speak>".encode())
    r.raise_for_status()
    out = config.VAR / "tts_test.mp3"
    out.write_bytes(r.content)
    return f"{len(r.content)} bytes -> {out} (play it!)"


def groq_stt():
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY missing in .env")
    sample = config.VAR / "tts_test.mp3"
    if not sample.exists():
        raise RuntimeError("needs the Azure TTS sample first")
    r = httpx.post("https://api.groq.com/openai/v1/audio/transcriptions", timeout=30,
                   headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                   files={"file": ("t.mp3", sample.read_bytes(), "audio/mpeg")},
                   data={"model": config.GROQ_STT_MODEL, "language": "ur"})
    r.raise_for_status()
    return r.json()["text"]


def weather():
    r = httpx.get("https://api.open-meteo.com/v1/forecast", params={"latitude": 30.81, "longitude": 73.45, "current": "temperature_2m"}, timeout=10)
    r.raise_for_status()
    return f"Okara {r.json()['current']['temperature_2m']} C"


print("\nAwaazSaathi service check\n")
check("Gemini (LLM + vision)", gemini)
check("Groq LLM (fallback)", groq_llm)
check("Azure TTS (ur-PK voice)", azure_tts)
check("Groq Whisper STT (Urdu)", groq_stt)
check("Open-Meteo weather", weather)
print("\nAll good!" if ok else "\nSome checks failed - the demo still runs (fallbacks + offline mode), but fix keys for the best demo.")
