"""Presenter / operator panel API: reset, offline switch, canned queries, outbreak scenario, health."""
import asyncio
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import config, prompts, seed, state
from ..db import SessionLocal, get_db
from ..models import Call, EventLog, Expert, Farmer, KBEntry, Outbreak, Query, now
from ..pipeline import outbreak, retrieval, router as trust_router
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


@r.post("/rebuild-index")
def rebuild(db=Depends(get_db)):
    retrieval.rebuild(db)
    return {"ok": True}
