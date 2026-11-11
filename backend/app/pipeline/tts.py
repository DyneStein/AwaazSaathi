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
    # an interrupted download can leave an empty/partial file: treat it as missing
    return f"/media/tts/{f.name}" if f.exists() and f.stat().st_size > 2000 else None


def _edge(text: str, out) -> None:
    """Microsoft Edge's free neural voices (same ur-PK voices as Azure), no API key. Needs internet; results are cached."""
    import asyncio

    import edge_tts

    async def go():
        await edge_tts.Communicate(text, config.EDGE_TTS_VOICE, rate="-8%").save(str(out))
    asyncio.run(go())


def _azure(text: str, out) -> None:
    ssml = (f"<speak version='1.0' xml:lang='ur-PK'><voice name='{config.AZURE_TTS_VOICE}'>"
            f"<prosody rate='-8%'>{escape(text)}</prosody></voice></speak>")
    r = httpx.post(f"https://{config.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
                   headers={"Ocp-Apim-Subscription-Key": config.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml",
                            "X-Microsoft-OutputFormat": FMT, "User-Agent": "awaazsaathi"},
                   content=ssml.encode("utf-8"), timeout=20)
    r.raise_for_status()
    out.write_bytes(r.content)


def edge_available() -> bool:
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def speak_later(texts: list[str]) -> None:
    """Generate missing clips in a background thread so pages never wait on the network."""
    import threading
    missing = [t for t in texts if t and not cached_url(t)]
    if missing and not state.is_offline():
        threading.Thread(target=lambda: [speak(t) for t in missing], daemon=True).start()


def speak(text: str) -> str | None:
    """Returns a URL for an mp3 of `text`, or None if unavailable."""
    text = (text or "").strip()
    if not text:
        return None
    url = cached_url(text)
    if url or state.is_offline():
        return url
    out = config.TTS_DIR / _name(text)
    providers = {"edge": (edge_available(), _edge, "edge-tts " + config.EDGE_TTS_VOICE),
                 "azure": (bool(config.AZURE_SPEECH_KEY), _azure, "azure " + config.AZURE_TTS_VOICE)}
    for name in config.TTS_ORDER:
        ok, fn, label = providers.get(name.strip(), (False, None, ""))
        if not ok:
            continue
        t0 = time.time()
        try:
            fn(text, out)
            if out.exists() and out.stat().st_size > 2000:
                state.mark("tts", True, label, int((time.time() - t0) * 1000))
                return cached_url(text)
        except Exception as e:  # noqa: BLE001
            out.unlink(missing_ok=True)
            state.mark("tts", False, f"{label}: {e}")
    return None
