"""LLM helpers. Primary Gemini Flash-Lite, fallback Groq Llama. Every result is cached by input hash.
The LLM never decides whether to escalate - that is done by explicit rules in nil_detection.py."""
import base64
import json
import re
import time

import httpx

from .. import config, state
from . import cache


def _gemini(prompt: str, model: str, json_mode: bool, image: tuple[bytes, str] | None = None) -> str:
    parts: list[dict] = [{"text": prompt}]
    if image:
        parts.append({"inline_data": {"mime_type": image[1], "data": base64.b64encode(image[0]).decode()}})
    body: dict = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0.2}}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": config.GEMINI_API_KEY}, json=body, timeout=25,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def _groq(prompt: str, json_mode: bool) -> str:
    body: dict = {"model": config.GROQ_TEXT_MODEL, "temperature": 0.2,
                  "messages": [{"role": "user", "content": prompt}]}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
                   headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"}, json=body, timeout=25)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0) if m else text)


def call(prompt: str, *, json_mode: bool, service: str, image: tuple[bytes, str] | None = None):
    """Returns parsed JSON / text, or None when offline or every provider failed."""
    k = cache.key(service, prompt, image[0] if image else b"")
    hit = cache.get(k)
    if hit is not None:
        return hit["v"]
    if state.is_offline():
        return None
    providers = []
    if config.GEMINI_API_KEY:
        model = config.GEMINI_VISION_MODEL if image else config.GEMINI_TEXT_MODEL
        providers.append(("gemini", lambda: _gemini(prompt, model, json_mode, image)))
    if config.GROQ_API_KEY and not image:
        providers.append(("groq", lambda: _groq(prompt, json_mode)))
    for name, fn in providers:
        t0 = time.time()
        try:
            raw = fn()
            v = _parse_json(raw) if json_mode else raw.strip()
            state.mark(service, True, name, int((time.time() - t0) * 1000))
            cache.put(k, {"v": v, "provider": name})
            return v
        except Exception as e:  # noqa: BLE001
            state.mark(service, False, f"{name}: {e}")
    return None


UNDERSTAND_PROMPT = """You are the intake step of AwaazSaathi, a helpline for Pakistani farmers.
A farmer said this (Urdu or Punjabi, transcribed in Urdu script, may contain errors):
\"\"\"{transcript}\"\"\"
Crop chosen on keypad: {crop}. Problem duration: {duration}.

Known problem tags: {tags}

Return ONLY JSON with keys:
- "crop": one of wheat|cotton|rice|sugarcane|maize|unknown
- "disease_tag": the single best matching known tag, or "unknown" if none clearly fits
- "symptoms_ur": short list of symptoms in Urdu
- "asks_dose": true if the farmer asks how much / what quantity / dose / mixing ratio of any chemical or fertilizer
- "chemicals": list of any pesticide or chemical names mentioned (as written)
- "spread": true if the farmer says the problem is spreading across the whole field, many fields or the village/area
- "normalized_query_ur": the question rewritten as one clear, simple Urdu sentence
"""

COMPOSE_PROMPT = """You are AwaazSaathi. Answer a Pakistani farmer in simple spoken Urdu, using Punjabi-friendly village words
(e.g. مونجی for rice, کماد for sugarcane, سپرے, کھیت). Use ONLY the facts in the reference text below - copy its
sentences wherever possible, do not add any new advice, product name or dose. 3 to 5 short sentences. No markdown.

Farmer's question: {question}

Reference text (expert knowledge base):
{passages}

Answer in Urdu:"""


def understand(transcript: str, crop: str, duration: str, tags: list[str]) -> dict | None:
    v = call(UNDERSTAND_PROMPT.format(transcript=transcript, crop=crop or "unknown", duration=duration or "unknown",
                                      tags=", ".join(tags)), json_mode=True, service="llm")
    return v if isinstance(v, dict) else None


def compose(question: str, passages: list[str]) -> str | None:
    v = call(COMPOSE_PROMPT.format(question=question, passages="\n---\n".join(passages)), json_mode=False, service="llm")
    return v if isinstance(v, str) and v else None


VISION_PROMPT = """You are an agronomy assistant for Pakistani farmers. Look at this crop photo.
Known problem tags: {tags}
Return ONLY JSON with keys: "crop" (wheat|cotton|rice|sugarcane|maize|unknown), "disease_tag" (best known tag or "unknown"),
"symptoms_ur" (list of visible symptoms in Urdu), "description_ur" (one Urdu sentence describing what is visible, as a farmer would
describe it), "confidence" (0-1)."""


def analyze_photo(image: bytes, mime: str, tags: list[str]) -> dict | None:
    v = call(VISION_PROMPT.format(tags=", ".join(tags)), json_mode=True, service="vision", image=(image, mime))
    return v if isinstance(v, dict) else None
