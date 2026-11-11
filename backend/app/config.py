"""Central config. Every threshold the judges may ask about lives here and can be tuned via .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
load_dotenv(ROOT / ".env")


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "centralindia").strip()
PHONE_HASH_SECRET = os.getenv("PHONE_HASH_SECRET", "dev-secret")

GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash-lite")
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
GROQ_TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")
AZURE_TTS_VOICE = os.getenv("AZURE_TTS_VOICE", "ur-PK-AsadNeural")

OFFLINE_MODE_DEFAULT = os.getenv("OFFLINE_MODE", "false").lower() == "true"

# ---- Nil detection (escalation) ----
RETRIEVAL_MIN = _f("RETRIEVAL_MIN", 0.30)   # below this the KB doesn't know -> human
GROUNDING_MIN = _f("GROUNDING_MIN", 0.6)    # share of answer 3-grams found in retrieved text
OUTBREAK_SUSPECT_PRIOR = 2                  # >=2 prior similar cases nearby -> treat as suspected outbreak

# ---- Outbreak engine ----
OUTBREAK_MIN_CASES = 3        # distinct farmers
OUTBREAK_WINDOW_DAYS = 7

# ---- Expert levels & scoring ----
MAJOR_EDIT_RATIO = 0.30       # normalized edit distance above this = "major edit"
PROMOTION = {
    "junior": {"to": "verified", "min_reviewed": 20, "min_score": 0.80},
    "verified": {"to": "senior", "min_reviewed": 100, "min_score": 0.90},
}
SLA_HOURS = {"senior_only": 2, "high": 3, "normal": 6}
SENIOR_PAY_PER_REVIEW_PKR = 150   # MOCK: sponsor-funded, no real payments
JUNIOR_SPONSOR_PER_APPROVED_PKR = 50  # MOCK: NGO/government sponsorship

DB_PATH = BACKEND / "var" / "awaaz.db"
VAR = BACKEND / "var"
MEDIA = BACKEND / "media"
TTS_DIR = MEDIA / "tts"          # committed cache: demo speaks even with no internet
UPLOAD_DIR = VAR / "uploads"
RECORDING_DIR = VAR / "recordings"
for d in (VAR, TTS_DIR, UPLOAD_DIR, RECORDING_DIR):
    d.mkdir(parents=True, exist_ok=True)
