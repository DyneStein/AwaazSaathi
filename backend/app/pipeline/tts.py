"""Text-to-speech. Primary: Azure ur-PK neural voice. Every clip is cached as an mp3 in backend/media/tts
(committed), so rehearsed prompts/answers play even with no internet. If no audio, the browser falls back
to its own speech engine or shows the text."""
import hashlib
import time
from xml.sax.saxutils import escape

import httpx

from .. import config, state

FMT = "audio-24khz-48kbitrate-mono-mp3"


def _name(text: str) -> str:
    return hashlib.sha256(f"{config.AZURE_TTS_VOICE}|{text}".encode()).hexdigest()[:24] + ".mp3"


def cached_url(text: str) -> str | None:
    f = config.TTS_DIR / _name(text)
    return f"/media/tts/{f.name}" if f.exists() else None


def speak(text: str) -> str | None:
    """Returns a URL for an mp3 of `text`, or None if unavailable."""
    text = (text or "").strip()
    if not text:
        return None
    url = cached_url(text)
    if url or state.is_offline() or not config.AZURE_SPEECH_KEY:
        return url
    ssml = (
        f"<speak version='1.0' xml:lang='ur-PK'><voice name='{config.AZURE_TTS_VOICE}'>"
        f"<prosody rate='-8%'>{escape(text)}</prosody></voice></speak>"
    )
    t0 = time.time()
    try:
        r = httpx.post(
            f"https://{config.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
            headers={
                "Ocp-Apim-Subscription-Key": config.AZURE_SPEECH_KEY,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": FMT,
                "User-Agent": "awaazsaathi",
            },
            content=ssml.encode("utf-8"),
            timeout=20,
        )
        r.raise_for_status()
        (config.TTS_DIR / _name(text)).write_bytes(r.content)
        state.mark("tts", True, config.AZURE_TTS_VOICE, int((time.time() - t0) * 1000))
        return cached_url(text)
    except Exception as e:  # noqa: BLE001
        state.mark("tts", False, str(e))
        return None
