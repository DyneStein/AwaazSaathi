"""Pre-generate every IVR prompt + demo answer as mp3 and cache AI results, so the demo runs offline.
Run with the server STOPPED or running (it uses its own DB session): cd backend && uv run python ../scripts/warm_cache.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import prompts, seed  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import KBEntry  # noqa: E402
from app.pipeline import llm, retrieval, tts  # noqa: E402
from app.pipeline.router import known_tags  # noqa: E402

print("Generating prompt audio...")
for k, t in prompts.PROMPTS.items():
    print(f"  {'ok ' if tts.speak(t) else 'NO '} {k}")
print("Escalation + callback texts...")
tts.speak(prompts.PROMPTS["escalated"])
seed.run()
db = SessionLocal()
retrieval.rebuild(db)
tags = known_tags(db)
print("KB answers (offline fallback audio)...")
for e in db.query(KBEntry):
    tts.speak(e.answer_ur)
print("Canned demo questions through the AI (cached for offline)...")
for k, c in prompts.CANNED.items():
    und = llm.understand(c["transcript"], c["crop"], c["duration"], tags)
    hits = retrieval.index.search(c["transcript"] + " " + ((und or {}).get("normalized_query_ur") or ""), crop=c["crop"])
    if hits and hits[0][1] >= 0.3:
        ans = llm.compose((und or {}).get("normalized_query_ur") or c["transcript"], [hits[0][0].answer_ur])
        if ans:
            tts.speak(ans)
    print(f"  {k}: understanding={'ok' if und else 'none'} top={hits[0][0].disease_tag if hits else '-'}")
print("Done. Commit backend/media/ so the demo works with no internet.")
