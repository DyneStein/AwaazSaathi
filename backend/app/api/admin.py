"""Presenter / operator panel API: reset, offline switch, canned queries, outbreak scenario, health."""
import asyncio
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import config, prompts, seed, state
from ..db import SessionLocal, get_db
from ..models import Call, EventLog, Expert, Farmer, KBEntry, Outbreak, Query, now
from ..pipeline import llm, outbreak, retrieval, router as trust_router, stt, tts
from ..ws import hub
from .common import iso
from .expert import sla_sweep

r = APIRouter(prefix="/api/admin")


@r.post("/reset")
def reset():
    seed.run()
    hub.publish("reset", "reset", {})
    return {"ok": True}


class OfflineIn(BaseModel):
    on: bool


@r.post("/offline")
def set_offline(body: OfflineIn):
    state.offline["on"] = body.on
    hub.publish("admin", "offline", {"on": body.on})
    hub.publish("status", "offline", {"on": body.on})
    return {"offline": body.on}


@r.get("/health")
def health(db=Depends(get_db)):
    return {
        "offline": state.is_offline(),
        "local": {"Speech-to-text (whisper.cpp)": stt.local_available(), f"Language + vision ({config.OLLAMA_MODEL})": llm.ollama_available(),
                  "Urdu voice (edge-tts)": tts.edge_available()},
        "keys": {"gemini": bool(config.GEMINI_API_KEY), "groq": bool(config.GROQ_API_KEY),
                 "azure_tts": bool(config.AZURE_SPEECH_KEY)},
        "services": state.health,
        "counts": {"queries": db.query(Query).count(), "queued": db.query(Query).filter(Query.status.in_(["queued", "drafted"])).count(),
                   "kb": db.query(KBEntry).count(), "kb_promoted": db.query(KBEntry).filter(KBEntry.source == "promoted").count(),
                   "outbreaks": db.query(Outbreak).count(), "farmers": db.query(Farmer).count()},
        "thresholds": {"retrieval_min": config.RETRIEVAL_MIN, "grounding_min": config.GROUNDING_MIN,
                       "outbreak_min_cases": config.OUTBREAK_MIN_CASES, "outbreak_window_days": config.OUTBREAK_WINDOW_DAYS},
    }


class ThresholdIn(BaseModel):
    retrieval_min: float | None = None
    grounding_min: float | None = None


@r.post("/thresholds")
def thresholds(body: ThresholdIn):
    if body.retrieval_min is not None:
        config.RETRIEVAL_MIN = body.retrieval_min
    if body.grounding_min is not None:
        config.GROUNDING_MIN = body.grounding_min
    return {"retrieval_min": config.RETRIEVAL_MIN, "grounding_min": config.GROUNDING_MIN}


@r.get("/events")
def events(db=Depends(get_db)):
    return [{"id": e.id, "kind": e.kind, "message": e.message, "at": iso(e.created_at)}
            for e in db.query(EventLog).order_by(EventLog.id.desc()).limit(60)]


@r.get("/outbreak-counters")
def counters(db=Depends(get_db)):
    since = outbreak.window_start()
    from sqlalchemy import func
    rows = (db.query(Query.tehsil, Query.disease_tag, func.count(func.distinct(Query.farmer_id)))
            .filter(Query.created_at >= since, Query.disease_tag.isnot(None))
            .group_by(Query.tehsil, Query.disease_tag).all())
    active = {(o.tehsil, o.disease_tag) for o in db.query(Outbreak).filter(Outbreak.status == "active")}
    names = {k.disease_tag: k.title_en for k in db.query(KBEntry)}
    out = [{"tehsil": t, "disease_tag": tag, "name_en": names.get(tag, tag), "count": n,
            "threshold": config.OUTBREAK_MIN_CASES, "active": (t, tag) in active} for t, tag, n in rows]
    return sorted(out, key=lambda x: (-x["active"], -x["count"]))


def fire_canned(db, key: str) -> dict:
    c = prompts.CANNED.get(key)
    if not c:
        raise HTTPException(404, "unknown canned query")
    phone = seed.demo_phone(c["persona"])
    f = db.query(Farmer).filter(Farmer.phone_hash == seed.hash_phone(phone)).first()
    call = Call(farmer_id=f.id, language="pa")
    db.add(call)
    db.commit()
    q = trust_router.process(db, farmer=f, call_id=call.id, crop=c["crop"], duration=c["duration"], transcript=c["transcript"])
    return {"query_id": q.id, "status": q.status, "reasons": q.reasons, "tehsil": f.tehsil}


@r.post("/canned/{key}")
def canned(key: str, db=Depends(get_db)):
    return fire_canned(db, key)


@r.post("/outbreak-scenario")
async def outbreak_scenario():
    """Fires the two remaining Okara yellow-rust cases 2 s apart so the counter visibly ticks 1 -> 2 -> 3."""
    results = []
    for key in ("rust_okara_2", "rust_okara_3"):
        db = SessionLocal()
        try:
            results.append(await asyncio.to_thread(fire_canned, db, key))
        finally:
            db.close()
        await asyncio.sleep(2)
    return {"ok": True, "results": results}


@r.post("/followups")
def followups(db=Depends(get_db)):
    """Demo trigger for the 3-day follow-up call: every farmer answered recently gets a voice check-in."""
    from ..models import InboxItem
    from ..pipeline import tts
    since = now() - timedelta(days=7)
    latest: dict[int, Query] = {}
    for q in db.query(Query).filter(Query.status.in_(["answered_ai", "approved"]), Query.answered_at >= since).order_by(Query.id):
        latest[q.farmer_id] = q
    crop_ur = {"wheat": "گندم", "cotton": "کپاس", "rice": "مونجی", "sugarcane": "کماد", "maize": "مکئی"}
    for q in latest.values():
        text = (f"السلام علیکم، آواز ساتھی سے بات ہو رہی ہے۔ تین دن پہلے آپ نے اپنی {crop_ur.get(q.crop, 'فصل')} کے بارے میں پوچھا تھا۔ "
                "کیا اب فرق پڑا ہے؟ بہتر ہو تو ایک دبائیں۔ مسئلہ باقی ہو تو دو دبائیں، ہمارا ماہر آپ کو فون کرے گا۔")
        audio = tts.speak(text)
        db.add(InboxItem(farmer_id=q.farmer_id, kind="followup", title_ur="تین دن بعد خیریت کی کال", text_ur=text, audio_url=audio, query_id=q.id))
        hub.publish(f"farmer:{q.farmer_id}", "followup", {"query_id": q.id, "text": text, "audio_url": audio})
    db.add(EventLog(kind="followup", message=f"3-day follow-up calls placed to {len(latest)} farmers"))
    db.commit()
    return {"ok": True, "count": len(latest)}


@r.post("/sla-fast-forward")
def sla_ff(db=Depends(get_db)):
    """Demo helper: pretend 3 hours passed for every open query, then run the SLA sweep."""
    for q in db.query(Query).filter(Query.status.in_(["queued", "drafted"])):
        if q.sla_due_at:
            q.sla_due_at = q.sla_due_at - timedelta(hours=3)
            q.created_at = q.created_at - timedelta(hours=3)
    db.commit()
    return {"escalated": sla_sweep(db)}


@r.post("/experts/{expert_id}/verify")
def verify(expert_id: int, approve: bool = True, db=Depends(get_db)):
    e = db.get(Expert, expert_id)
    if not e:
        raise HTTPException(404)
    e.verification_status = "verified" if approve else "rejected"
    db.add(EventLog(kind="verification", message=f"Admin {'approved' if approve else 'rejected'} {e.name}'s degree (MOCK check)"))
    db.commit()
    hub.publish("expert", "verification", {"expert_id": e.id, "status": e.verification_status})
    return {"ok": True, "status": e.verification_status}


@r.get("/kb")
def kb(db=Depends(get_db)):
    return [{"id": k.id, "crop": k.crop, "disease_tag": k.disease_tag, "title_ur": k.title_ur, "title_en": k.title_en,
             "source": k.source, "needs_expert_review": k.needs_expert_review, "reviewed_by": k.reviewed_by,
             "reviewed_at": iso(k.reviewed_at), "senior_only": k.senior_only} for k in db.query(KBEntry).order_by(KBEntry.id)]


@r.get("/evaluation")
def evaluation(db=Depends(get_db)):
    """Runs the labelled safety set through the live decision rules (rules only, about a second)."""
    from ..pipeline import evaluate
    return evaluate.run(db)


@r.post("/rebuild-index")
def rebuild(db=Depends(get_db)):
    retrieval.rebuild(db)
    return {"ok": True}


@r.get("/map")
def map_data(days: int = 30, db=Depends(get_db)):
    """Everything the operations map shows. Locations are tehsil centres only: the system never stores a farm's position."""
    from collections import Counter, defaultdict

    from ..models import Dealer, DealerAlert
    since = now() - timedelta(days=days)
    titles = {k.disease_tag: k.title_en for k in db.query(KBEntry)}
    farmers = Counter(t for (t,) in db.query(Farmer.tehsil))
    qs = db.query(Query).filter(Query.created_at >= since).order_by(Query.id.desc()).all()
    by_t: dict[str, Counter] = defaultdict(Counter)
    problems: dict[str, Counter] = defaultdict(Counter)
    for q in qs:
        by_t[q.tehsil][_bucket(q.status)] += 1
        if q.disease_tag:
            problems[q.tehsil][q.disease_tag] += 1
    active = [o for o in db.query(Outbreak).filter(Outbreak.status == "active").order_by(Outbreak.id)]
    counter_rows = counters(db)
    dealers = db.query(Dealer).order_by(Dealer.id).all()
    confirmed = {a.dealer_id for a in db.query(DealerAlert).filter(DealerAlert.confirmed_at.isnot(None))}
    alerted = {a.dealer_id for a in db.query(DealerAlert)}
    tehsils = []
    for name, t in outbreak.TEHSILS.items():
        c = by_t.get(name, Counter())
        tehsils.append({
            "name": name, "ur": t["ur"], "district": t["district"], "lat": t["lat"], "lon": t["lon"],
            "neighbors": t.get("neighbors", []), "farmers": farmers.get(name, 0),
            "questions": sum(c.values()), "ai": c["ai"], "expert": c["expert"], "waiting": c["waiting"],
            "problems": [{"tag": k, "name_en": titles.get(k, k), "count": n} for k, n in problems.get(name, Counter()).most_common(3)],
            "outbreak": next(({"id": o.id, "disease_tag": o.disease_tag, "name_en": titles.get(o.disease_tag, o.disease_tag),
                               "cases": o.case_count, "at": iso(o.created_at)} for o in active if o.tehsil == name), None),
        })
    return {
        "days": days,
        "totals": {"farmers": sum(farmers.values()), "questions": len(qs), "ai": sum(1 for q in qs if _bucket(q.status) == "ai"),
                   "expert": sum(1 for q in qs if _bucket(q.status) == "expert"), "waiting": sum(1 for q in qs if _bucket(q.status) == "waiting"),
                   "outbreaks": len(active), "dealers": len(dealers), "experts": db.query(Expert).count()},
        "tehsils": tehsils,
        "questions": [{"id": q.id, "tehsil": q.tehsil, "crop": q.crop, "channel": q.channel, "status": q.status, "state": _bucket(q.status),
                       "problem": titles.get(q.disease_tag or "", None), "emergency": any(str(x).startswith("health_emergency") for x in (q.reasons or [])),
                       "at": iso(q.created_at)} for q in qs[:120]],
        "dealers": [{"id": d.id, "shop": d.shop, "name": d.name, "tehsil": d.tehsil, "alerted": d.id in alerted, "confirmed": d.id in confirmed} for d in dealers],
        "watch": [c for c in counter_rows if c["count"] > 0][:8],
    }


def _bucket(status: str) -> str:
    """ai = answered by the AI, expert = answered by an agronomist, waiting = with the experts now."""
    if status == "answered_ai":
        return "ai"
    if status == "approved":
        return "expert"
    return "waiting"
