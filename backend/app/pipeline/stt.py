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
# Whisper copies the style of its prompt. An example farmer sentence written in Urdu script keeps Punjabi speech in
# Urdu script; with only a formal Urdu prompt it sometimes wrote Punjabi in English letters ("Mary, kanakðu pate píleni").
PROMPT = {
    "pa": "میری کنک دے پتے پیلے ہو گئے نیں۔ کپاہ تے چٹی مکھی اے۔ کی کراں؟",
    "ur": "میری گندم کے پتے پیلے ہو گئے ہیں۔ کپاس پر سفید مکھی ہے۔ کیا کروں؟",
}


def local_available() -> bool:
    return bool(shutil.which(config.WHISPER_BIN)) and bool(shutil.which(config.FFMPEG_BIN)) and Path(config.WHISPER_MODEL).exists()


CROP_HINT = {"wheat": "گندم کنک", "cotton": "کپاس نرما", "rice": "مونجی چاول", "sugarcane": "کماد گنا", "maize": "مکئی"}


# Cut silence longer than a second (start, middle, end): Whisper invents repeated phrases in long silent tails.
SILENCE = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2:stop_periods=-1:stop_duration=1:stop_threshold=-45dB"


def _local(audio: bytes, hint: str = HINT, careful: bool = False) -> str:
    with tempfile.TemporaryDirectory() as d:
        src, wav, raw = os.path.join(d, "in.bin"), os.path.join(d, "in.wav"), os.path.join(d, "raw.wav")
        Path(src).write_bytes(audio)
        subprocess.run([config.FFMPEG_BIN, "-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", raw], check=True, timeout=30)
        subprocess.run([config.FFMPEG_BIN, "-y", "-loglevel", "error", "-i", raw, "-af", SILENCE, wav], check=True, timeout=30)
        if os.path.getsize(wav) < 16000 * 2 * 0.4:   # under 0.4 s left: the speech was quiet, use the untrimmed audio
            wav = raw
        cmd = [config.WHISPER_BIN, "-m", config.WHISPER_MODEL, "-l", "ur", "-f", wav, "-nt", "-np", "--prompt", hint]
        if careful:
            cmd += ["-bs", "5", "-bo", "5"]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=True)
        return dedupe(" ".join(out.stdout.split()).strip())


def latin_share(text: str) -> float:
    """Share of letters written in the Latin alphabet (Whisper sometimes romanizes Punjabi)."""
    letters = [c for c in text if c.isalpha()]
    return sum(1 for c in letters if c.isascii() or "\u00c0" <= c <= "\u024f") / len(letters) if letters else 0.0


def dedupe(text: str) -> str:
    """Drops phrases (2 to 8 words) that Whisper repeats back to back, a typical error on silence or noise.
    Single doubled words are kept: Urdu and Punjabi use them on purpose (چھوٹے چھوٹے, نکے نکے)."""
    import re
    words = text.split()
    norm = lambda w: re.sub(r"[۔؟?!.,،]", "", w)  # noqa: E731
    changed = True
    while changed:
        changed = False
        for n in range(8, 1, -1):
            i = 0
            while i + 2 * n <= len(words):
                if [norm(w) for w in words[i:i + n]] == [norm(w) for w in words[i + n:i + 2 * n]]:
                    del words[i + n:i + 2 * n]
                    changed = True
                else:
                    i += 1
    # a whole sentence said again later in the same answer
    out: list[str] = []
    for part in re.split(r"(?<=[۔؟?!])\s+", " ".join(words)):
        key = re.sub(r"[۔؟?!.,،\s]", "", part)
        if key and any(re.sub(r"[۔؟?!.,،\s]", "", x) == key for x in out):
            continue
        out.append(part)
    return " ".join(out).strip()


def garbled(text: str) -> bool:
    """Urdu-script output is fine; plain Roman Urdu is fine (retrieval reads it); accented Latin (ð, í) is not."""
    if latin_share(text) <= 0.5:
        return False
    return any(not c.isascii() and c.isalpha() and "\u00c0" <= c <= "\u024f" for c in text)


def _local_checked(audio: bytes, hint: str, other_hint: str) -> str:
    """Local Whisper; if the text comes out in English letters, try once more more carefully; still Latin = not understood."""
    text = _local(audio, hint)
    if latin_share(text) <= 0.5:
        return text
    retry = _local(audio, other_hint, careful=True)
    if latin_share(retry) <= 0.5:
        return retry
    return "" if garbled(retry) else retry


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


def transcribe(audio: bytes, filename: str = "q.webm", mime: str = "audio/webm", crop: str = "", lang: str = "pa") -> tuple[str | None, str]:
    lang = lang if lang in PROMPT else "pa"
    words = " " + CROP_HINT[crop] if crop in CROP_HINT else ""
    hint, other = PROMPT[lang] + words, PROMPT["ur" if lang == "pa" else "pa"] + " " + HINT + words
    k = cache.key("stt", audio + lang.encode())
    hit = cache.get(k)
    if hit:
        return hit["text"], hit["engine"] + " (cached)"
    providers = {
        "local": (local_available(), lambda: _local_checked(audio, hint, other), "whisper.cpp (on-device)"),
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
