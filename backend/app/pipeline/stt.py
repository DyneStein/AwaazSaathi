"""Speech-to-text. Order (STT_ORDER): local whisper.cpp (no key, Metal GPU) -> Groq Whisper -> Gemini audio.
Offline/failed: returns None and the UI offers typed / sample input."""
import base64
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from .. import config, state
from . import cache

HINT = "کسان اپنی فصل گندم، کپاس، مونجی، کماد یا مکئی کے بارے میں سوال پوچھ رہا ہے۔"


def local_available() -> bool:
    return bool(shutil.which(config.WHISPER_BIN)) and Path(config.WHISPER_MODEL).exists()


def _local(audio: bytes) -> str:
    with tempfile.TemporaryDirectory() as d:
        src, wav = os.path.join(d, "in.bin"), os.path.join(d, "in.wav")
        Path(src).write_bytes(audio)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", wav], check=True, timeout=30)
        out = subprocess.run([config.WHISPER_BIN, "-m", config.WHISPER_MODEL, "-l", "ur", "-f", wav, "-nt", "-np",
                              "--prompt", HINT], capture_output=True, text=True, timeout=60, check=True)
        return " ".join(out.stdout.split()).strip()


def _groq(audio: bytes, filename: str, mime: str) -> str:
    r = httpx.post("https://api.groq.com/openai/v1/audio/transcriptions",
                   headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                   files={"file": (filename, audio, mime)},
                   data={"model": config.GROQ_STT_MODEL, "language": "ur", "response_format": "json", "prompt": HINT}, timeout=20)
    r.raise_for_status()
    return r.json().get("text", "").strip()


def _gemini(audio: bytes, mime: str) -> str:
    body = {"contents": [{"parts": [
        {"text": "Transcribe this Pakistani farmer's speech (Urdu or Punjabi) exactly, in Urdu script. Output only the transcript."},
        {"inline_data": {"mime_type": mime.split(";")[0], "data": base64.b64encode(audio).decode()}}]}]}
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_TEXT_MODEL}:generateContent",
                   params={"key": config.GEMINI_API_KEY}, json=body, timeout=25)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def transcribe(audio: bytes, filename: str = "q.webm", mime: str = "audio/webm") -> tuple[str | None, str]:
    k = cache.key("stt", audio)
    hit = cache.get(k)
    if hit:
        return hit["text"], hit["engine"] + " (cached)"
    providers = {
        "local": (local_available(), lambda: _local(audio), "whisper.cpp (on-device)"),
        "groq": (bool(config.GROQ_API_KEY) and not state.is_offline(), lambda: _groq(audio, filename, mime), "groq-whisper"),
        "gemini": (bool(config.GEMINI_API_KEY) and not state.is_offline(), lambda: _gemini(audio, mime), "gemini-audio"),
    }
    for name in config.STT_ORDER:
        ok, fn, label = providers.get(name.strip(), (False, None, ""))
        if not ok:
            continue
        t0 = time.time()
        try:
            text = fn()
            state.mark("stt", True, label, int((time.time() - t0) * 1000))
            if text:
                cache.put(k, {"text": text, "engine": label})
                return text, label
        except Exception as e:  # noqa: BLE001
            state.mark("stt", False, f"{label}: {e}")
    return None, "offline" if state.is_offline() and not local_available() else "failed"
