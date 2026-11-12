"""Nil detection: decide, with explicit rules, when the AI must NOT answer and a human expert takes over.
We never rely on the LLM saying "I don't know". Every threshold is in config.py / .env and can be tuned live.

Escalate if ANY of:
  1. retrieval score < RETRIEVAL_MIN          (knowledge base doesn't cover it)
  2. grounding < GROUNDING_MIN                (answer not supported by retrieved text)
  3. dose / quantity question                 -> senior only
  4. banned or restricted chemical mentioned  -> senior only
  5. suspected outbreak                       -> senior only
  6. top KB entry is marked senior_only       -> senior only
  7. health emergency (poisoning symptoms)    -> senior only, top priority, farmer told to go to hospital
  8. best source is for a different crop      (the farmer chose another crop on the keypad)
  9. two different problems match equally     (ambiguous, a human must tell them apart)
 10. weak match with thin evidence            (score under STRONG_MATCH and fewer than MIN_EVIDENCE_TERMS of the
                                               farmer's own symptom words appear in the source: too vague to diagnose)
"""
import re
from dataclasses import dataclass, field

from .. import config

# Dose / quantity words: Urdu, Punjabi (Shahmukhi), Roman Urdu, English.
# STRONG words alone mean a dose question. WEAK words ("how much") only count next to a chemical/spray/fertilizer word,
# so "کتنے دن سے" (since how many days) does not trigger.
DOSE_STRONG = ["مقدار", "ملی لیٹر", "ڈوز", "فی ایکڑ", "گرام فی", "لیٹر فی", "miqdar", "per acre", "dose", "dosage", "ml per"]
DOSE_WEAK = ["کتنی", "کتنا", "کتنے", "کِنّی", "کنی", "کِنّا", "ملاؤں", "ملانا", "گھولوں", "ڈالوں", "kitna", "kitni", "kinni",
             "how much", "quantity"]
DOSE_CONTEXT = ["سپرے", "اسپرے", "دوائی", "دوا", "زہر", "کھاد", "یوریا", "ڈی اے پی", "spray", "dawai", "zehar", "khad",
                "pesticide", "fertilizer", "urea"]
# Banned / restricted chemicals (MUST be confirmed by an agronomist against the current Pakistan list - needs_expert_review)
BANNED_CHEMICALS = [
    "endosulfan", "اینڈوسلفان", "monocrotophos", "مونوکروٹوفاس", "methyl parathion", "پیراتھیان",
    "aldrin", "dieldrin", "ddt", "ڈی ڈی ٹی", "lindane", "phorate", "فوریٹ", "paraquat", "پیراکواٹ",
]
SPREAD_WORDS = ["پورا کھیت", "سارا کھیت", "سارے کھیت", "پورے علاقے", "سارا علاقہ", "سارے علاقے", "پورے پنڈ", "سارا پنڈ",
                "سارے پنڈ", "پورا گاؤں", "سارے گاؤں", "ہمسایوں", "گوانڈیاں", "سب کے کھیت", "پھیل رہی", "پھیل رہا", "پھیل گئی"]


# A person may have been poisoned: never an AI answer. Phrases, not single words ("زہر" alone also means pesticide).
EMERGENCY_WORDS = ["چکر آ", "الٹی", "الٹیاں", "بے ہوش", "بیہوش", "زہر پی", "زہر کھا", "دوائی پی", "سپرے پی", "سانس نہیں", "سانس رک",
                   "آنکھ میں چلا", "آنکھوں میں چلا", "behosh", "ulti", "chakkar", "zehar pi", "poisoned"]


@dataclass
class Decision:
    escalate: bool
    route: str                     # ai | junior | senior_only
    reasons: list[str] = field(default_factory=list)


def _has(text: str, words: list[str]) -> list[str]:
    t = (text or "").lower()
    found = []
    for w in words:
        wl = w.lower()
        if re.fullmatch(r"[a-z ]+", wl):
            if re.search(rf"\b{re.escape(wl)}\b", t):
                found.append(w)
        elif wl in t:
            found.append(w)
    return found


def grounding_score(answer: str, sources: list[str]) -> float:
    """Share of the answer's character 3-grams (ignoring spaces/punctuation) that appear in the retrieved text."""
    norm = lambda s: re.sub(r"[\s\.\،۔,!?؟:;\-\"'()]+", "", s or "")
    a, src = norm(answer), norm(" ".join(sources))
    if len(a) < 3:
        return 0.0
    grams = {a[i:i + 3] for i in range(len(a) - 2)}
    src_grams = {src[i:i + 3] for i in range(len(src) - 2)}
    return len(grams & src_grams) / len(grams)


def decide(*, transcript: str, retrieval_score: float, grounding: float, top_senior_only: bool,
           llm_asks_dose: bool = False, llm_chemicals: list[str] | None = None, llm_spread: bool = False,
           prior_similar_cases: int = 0, crop_mismatch: str | None = None, ambiguous: str | None = None,
           evidence_terms: int | None = None,
           retrieval_min: float | None = None, grounding_min: float | None = None) -> Decision:
    rmin = config.RETRIEVAL_MIN if retrieval_min is None else retrieval_min
    gmin = config.GROUNDING_MIN if grounding_min is None else grounding_min
    reasons: list[str] = []
    senior = False

    emergency = _has(transcript, EMERGENCY_WORDS)
    if emergency:
        reasons.append(f"health_emergency: {', '.join(emergency)}")
        senior = True
    dose = _has(transcript, DOSE_STRONG)
    if not dose and _has(transcript, DOSE_CONTEXT):
        dose = _has(transcript, DOSE_WEAK)
    if dose or llm_asks_dose:
        reasons.append(f"dose_question: {', '.join(dose) or 'detected by intake'}")
        senior = True
    banned = _has(transcript + " " + " ".join(llm_chemicals or []), BANNED_CHEMICALS)
    if banned:
        reasons.append(f"banned_chemical: {', '.join(banned)}")
        senior = True
    spread = _has(transcript, SPREAD_WORDS)
    if prior_similar_cases >= config.OUTBREAK_SUSPECT_PRIOR or spread or llm_spread:
        why = f"{prior_similar_cases} similar cases nearby in 7 days" if prior_similar_cases >= config.OUTBREAK_SUSPECT_PRIOR else "farmer reports spread"
        reasons.append(f"suspected_outbreak: {why}")
        senior = True
    if top_senior_only:
        reasons.append("senior_only_topic")
        senior = True
    if retrieval_score < rmin:
        reasons.append(f"low_retrieval: {retrieval_score:.2f} < {rmin:.2f}")
    elif crop_mismatch:
        reasons.append(f"crop_mismatch: {crop_mismatch}")
    elif ambiguous:
        reasons.append(f"ambiguous_match: {ambiguous}")
    elif evidence_terms is not None and retrieval_score < config.STRONG_MATCH and evidence_terms < config.MIN_EVIDENCE_TERMS:
        reasons.append(f"thin_evidence: score {retrieval_score:.2f} with only {evidence_terms} matching symptom words")
    elif grounding < gmin:
        reasons.append(f"not_grounded: {grounding:.2f} < {gmin:.2f}")

    if not reasons:
        return Decision(False, "ai", [])
    return Decision(True, "senior_only" if senior else "junior", reasons)
