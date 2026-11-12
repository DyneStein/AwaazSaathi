"""Seed / reset the demo database. Deterministic: same data every reset."""
import hashlib
import hmac
import json
import random
from datetime import timedelta

from . import config
from .db import Base, SessionLocal, engine
from .models import (Dealer, EventLog, Expert, Farmer, InboxItem, KBEntry, Query, ScoreEvent, now)
from .pipeline import retrieval, scoring

TEHSILS = list(json.loads((config.BACKEND / "data" / "tehsils.json").read_text("utf-8")).keys())


def hash_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    return hmac.new(config.PHONE_HASH_SECRET.encode(), digits.encode(), hashlib.sha256).hexdigest()


# Demo caller numbers. FAKE numbers that exist only in the simulator (it plays the role of the phone network's caller ID).
# The database stores only hash_phone(number) + tehsil.
def demo_phone(i: int) -> str:
    return f"0300{1000000 + i * 7919:07d}"


FARMER_TEHSILS = (["Okara"] * 6 + ["Depalpur"] * 3 + ["Renala Khurd"] * 2 + ["Sahiwal"] * 3 + ["Pakpattan"] * 2 +
                  ["Multan"] * 3 + ["Khanewal"] * 2 + ["Vehari"] * 2 + ["Faisalabad"] * 3 + ["Jhang"] * 2 + ["Sheikhupura"] * 2)

DEALERS = [
    ("Haji Muhammad Aslam", "Aslam Zarai Markaz", "Okara", "1111"),
    ("Rana Tariq", "Rana Agri Store", "Okara", "2222"),
    ("Malik Shahid", "Kissan Beej Ghar", "Depalpur", "3333"),
    ("Chaudhry Nadeem", "Nadeem Pesticides & Seeds", "Sahiwal", "4444"),
    ("Sheikh Farooq", "Multan Agro Centre", "Multan", "5555"),
]

# name, level, verification, degree, specialties, reviewed, clean, rejected, reviews_done, earnings, sponsor
EXPERTS = [
    ("Dr. Ayesha Malik", "senior", "verified", "PhD Plant Pathology, UAF", ["wheat", "rice"], 0, 0, 0, 212, 31800, "Punjab Agri Dept (pilot)"),
    ("Dr. Imran Haider", "senior", "verified", "MSc (Hons) Entomology, UAF", ["cotton", "sugarcane", "maize"], 0, 0, 0, 167, 25050, "Punjab Agri Dept (pilot)"),
    ("Sana Javed", "verified", "verified", "BSc (Hons) Agriculture, PMAS-AAUR", ["wheat", "maize"], 46, 41, 2, 0, 2050, "Kissan Welfare NGO"),
    ("Bilal Ahmed", "verified", "verified", "BSc (Hons) Agronomy, BZU Multan", ["cotton"], 38, 33, 3, 0, 1650, "Kissan Welfare NGO"),
    ("Hamza Tariq", "junior", "verified", "BSc (Hons) Agriculture, UAF (2026)", ["wheat", "sugarcane"], 19, 16, 2, 0, 800, "Kissan Welfare NGO"),
    ("Fatima Noor", "junior", "verified", "BSc (Hons) Plant Protection, UAF (2026)", ["cotton", "rice"], 8, 6, 1, 0, 300, ""),
    ("Usman Ali", "junior", "pending", "BSc (Hons) Agriculture, IUB (2026)", ["rice"], 0, 0, 0, 0, 0, ""),
]


def _history(db, e: Expert, rng: random.Random) -> None:
    outcomes = ["clean"] * e.clean_count + ["rejected"] * e.rejected_count + \
               ["major_edit"] * (e.reviewed_count - e.clean_count - e.rejected_count)
    rng.shuffle(outcomes)
    clean = 0
    start = now() - timedelta(days=60)
    for i, o in enumerate(outcomes, 1):
        clean += o == "clean"
        db.add(ScoreEvent(expert_id=e.id, outcome=o, score_after=scoring.score(clean, i),
                          created_at=start + timedelta(hours=i * 60 * 24 / max(1, len(outcomes)))))


def run() -> None:
    rng = random.Random(42)
    # Rows are replaced inside one transaction instead of dropping the tables, so a page that polls the server
    # in the middle of a reset sees either the old data or the new data, never a missing table.
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        # Knowledge base
        for k in json.loads((config.BACKEND / "data" / "kb_seed.json").read_text("utf-8")):
            db.add(KBEntry(**k, needs_expert_review=True, source="seed"))
        # Farmers
        farmers = []
        for i, t in enumerate(FARMER_TEHSILS, 1):
            f = Farmer(phone_hash=hash_phone(demo_phone(i)), tehsil=t, language=rng.choice(["pa", "pa", "ur"]))
            db.add(f)
            farmers.append(f)
        for name, shop, t, pin in DEALERS:
            db.add(Dealer(name=name, shop=shop, tehsil=t, pin=pin))
        for (name, level, ver, deg, spec, rev, clean, rej, done, earn, sponsor) in EXPERTS:
            e = Expert(name=name, level=level, verification_status=ver, degree=deg, specialties=spec,
                       reviewed_count=rev, clean_count=clean, rejected_count=rej, reviews_done=done,
                       earnings_pkr=earn, sponsor=sponsor,
                       degree_file="degree_upload.pdf (MOCK)" if ver != "verified" else "verified.pdf (MOCK)")
            db.add(e)
            db.flush()
            _history(db, e, rng)
        db.flush()

        by_t = lambda t: [f for f in farmers if f.tehsil == t]  # noqa: E731
        okara = by_t("Okara")
        t0 = now()
        past = [
            # (farmer, crop, tag, transcript, status, days_ago, answer)
            (by_t("Faisalabad")[0], "wheat", "wheat_brown_rust", "گندم کے پتوں پر بھورے دانے ہیں", "answered_ai", 5),
            (by_t("Multan")[0], "cotton", "cotton_whitefly", "کپاس کے پتوں کے نیچے سفید مکھی بہت ہے", "answered_ai", 4),
            (by_t("Multan")[1], "cotton", "cotton_leaf_curl", "نرمے کے پتے مڑ رہے ہیں", "answered_ai", 6),
            (by_t("Sahiwal")[0], "wheat", "wheat_termite", "گندم کے پودے سوکھ رہے ہیں جڑ سے کٹے ہیں", "approved", 3),
            (by_t("Vehari")[0], "cotton", "cotton_pink_bollworm", "ٹینڈوں میں گلابی سنڈی ہے", "answered_ai", 2),
            (by_t("Jhang")[0], "rice", "rice_zinc_khaira", "مونجی کی پنیری پر بھورے دھبے ہیں", "answered_ai", 1),
            # one prior yellow rust case in Okara -> the outbreak scenario needs 2 more farmers
            (okara[0], "wheat", "wheat_yellow_rust", "میری کنک کے پتوں پر پیلی دھاریاں ہیں", "answered_ai", 3),
        ]
        for f, crop, tag, text, status, days in past:
            db.add(Query(farmer_id=f.id, tehsil=f.tehsil, crop=crop, disease_tag=tag, transcript=text,
                         normalized_query=text, status=status, route="ai" if status == "answered_ai" else "junior",
                         retrieval_score=0.6, grounding=0.9, answered_by="AI" if status == "answered_ai" else "Dr. Ayesha Malik",
                         created_at=t0 - timedelta(days=days), answered_at=t0 - timedelta(days=days)))
        # Two items already waiting in the expert queue so it is never empty
        db.add(Query(farmer_id=by_t("Khanewal")[0].id, tehsil="Khanewal", crop="cotton", disease_tag="cotton_whitefly",
                     transcript="سفید مکھی کے لیے سپرے کتنی مقدار میں کروں فی ایکڑ؟", normalized_query="سفید مکھی کے سپرے کی مقدار فی ایکڑ کیا ہے؟",
                     status="queued", route="senior_only", priority=2, reasons=["dose_question: مقدار, فی ایکڑ"],
                     retrieval_score=0.52, ai_answer="(AI held back: dose questions go to a senior agronomist)",
                     created_at=t0 - timedelta(minutes=50), sla_due_at=t0 + timedelta(hours=config.SLA_HOURS["senior_only"]) - timedelta(minutes=50)))
        db.add(Query(farmer_id=by_t("Sheikhupura")[0].id, tehsil="Sheikhupura", crop="rice", disease_tag=None,
                     transcript="مونجی کے کھیت میں پودے گول دائرے میں گر رہے ہیں اور نیچے سے تنا گل رہا ہے",
                     normalized_query="مونجی کے پودے دائروں میں گر رہے ہیں اور تنا نیچے سے گل رہا ہے",
                     status="queued", route="junior", priority=1, reasons=["low_retrieval: 0.21 < 0.30"], retrieval_score=0.21,
                     created_at=t0 - timedelta(minutes=20), sla_due_at=t0 + timedelta(hours=config.SLA_HOURS["normal"]) - timedelta(minutes=20)))
        db.add(EventLog(kind="system", message="Demo data reset"))
        db.commit()
        retrieval.rebuild(db)
    finally:
        db.close()


def personas() -> list[dict]:
    """Demo callers for the simulator (raw numbers live only in the simulator UI)."""
    out = []
    for i, t in enumerate(FARMER_TEHSILS, 1):
        out.append({"phone": demo_phone(i), "tehsil": t, "label": f"Kisan #{i} · {t}"})
    return out


if __name__ == "__main__":
    run()
    print("seeded")
