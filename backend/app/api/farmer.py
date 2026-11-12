"""Farmer door: the call simulator (voice), the photo/WhatsApp door, and the callback inbox."""
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import config, prompts, seed, state
from ..db import get_db
from ..models import Call, EventLog, Farmer, InboxItem, Query, now
from ..pipeline import llm, outbreak, router as trust_router, stt, tts
from ..ws import hub
from .common import iso, query_out

r = APIRouter(prefix="/api")


@r.get("/prompts")
def get_prompts(lang: str = "ur"):
    p = prompts.prompts_for(lang)
    tts.speak_later(list(p.values()))  # fill any missing clips in the background, never block the page
    return {k: {"text": v, "audio_url": tts.cached_url(v)} for k, v in p.items()}


@r.get("/tts")
def get_tts(text: str):
    return {"audio_url": tts.speak(text)}


@r.get("/demo/personas")
def personas():
    return {"personas": seed.personas(), "tehsils": [{"name": k, "ur": v["ur"]} for k, v in outbreak.TEHSILS.items()],
            "crops": prompts.CROPS, "crop_ur": prompts.CROP_UR, "durations": prompts.DURATIONS,
            "duration_ur": prompts.DURATION_UR,
            "canned": {k: {"label": v["label"], "transcript": v["transcript"], "crop": v["crop"]} for k, v in prompts.CANNED.items()}}


def _tehsil_prompt(lang: str, tehsil: str) -> dict:
    text = prompts.tehsil_confirm(lang, outbreak.TEHSILS.get(tehsil, {}).get("ur", tehsil))
    tts.speak_later([text])
    return {"text": text, "audio_url": tts.cached_url(text)}


class StartIn(BaseModel):
    phone: str
    language: str = "pa"


@r.post("/call/start")
def call_start(body: StartIn, db=Depends(get_db)):
    h = seed.hash_phone(body.phone)
    f = db.query(Farmer).filter(Farmer.phone_hash == h).first()
    known = f is not None
    if not f:
        f = Farmer(phone_hash=h, tehsil="Okara", language=body.language)
        db.add(f)
        db.flush()
    f.language = body.language
    c = Call(farmer_id=f.id, language=body.language)
    db.add(c)
    db.commit()
    return {"call_id": c.id, "farmer_id": f.id, "tehsil": f.tehsil,
            "tehsil_ur": outbreak.TEHSILS.get(f.tehsil, {}).get("ur", f.tehsil), "known": known,
            "tehsil_confirm": _tehsil_prompt(c.language, f.tehsil)}


class LangIn(BaseModel):
    language: str


@r.post("/call/{call_id}/language")
def set_language(call_id: int, body: LangIn, db=Depends(get_db)):
    c = db.get(Call, call_id)
    if not c:
        raise HTTPException(404)
    c.language = "pa" if body.language == "pa" else "ur"
    f = db.get(Farmer, c.farmer_id)
    f.language = c.language
    db.commit()
    return {"ok": True, "tehsil_confirm": _tehsil_prompt(c.language, f.tehsil)}


class TehsilIn(BaseModel):
    tehsil: str


@r.post("/call/{call_id}/tehsil")
def set_tehsil(call_id: int, body: TehsilIn, db=Depends(get_db)):
    c = db.get(Call, call_id)
    if not c or body.tehsil not in outbreak.TEHSILS:
        raise HTTPException(404)
    f = db.get(Farmer, c.farmer_id)
    f.tehsil = body.tehsil
    db.commit()
    return {"ok": True}


def _result(q: Query, engine: str = "", lang: str = "ur") -> dict:
    escalated = q.status != "answered_ai"
    emergency = any(r.startswith("health_emergency") for r in (q.reasons or []))
    esc = prompts.prompts_for(lang)["emergency" if emergency else "escalated"]
    return {"query": query_out(q), "escalated": escalated, "stt_engine": engine,
            "answer_text": q.final_answer if not escalated else esc,
            "answer_audio": q.final_audio_url if not escalated else tts.speak(esc)}


@r.post("/call/{call_id}/ask")
def ask(call_id: int, crop: str = Form(""), duration: str = Form(""), transcript: str = Form(""), category: str = Form(""),
        channel: str = Form("voice"), audio: UploadFile | None = File(None), db=Depends(get_db)):
    c = db.get(Call, call_id)
    if not c:
        raise HTTPException(404, "call not found")
    f = db.get(Farmer, c.farmer_id)
    audio_url, engine = None, "typed"
    if audio is not None:
        data = audio.file.read()
        ext = ".webm" if "webm" in (audio.content_type or "") else ".ogg" if "ogg" in (audio.content_type or "") else ".m4a"
        name = f"call{call_id}_{uuid.uuid4().hex[:8]}{ext}"
        # Held temporarily until the farmer answers the consent question; deleted if they say no.
        (config.UPLOAD_DIR / name).write_bytes(data)
        audio_url = f"/uploads/{name}"
        if not transcript:
            text, engine = stt.transcribe(data, name, audio.content_type or "audio/webm", crop)
            if not text:
                return {"needs_text": True, "stt_engine": engine, "audio_url": audio_url}
            transcript = text
    if not transcript.strip():
        raise HTTPException(400, "empty question")
    q = trust_router.process(db, farmer=f, call_id=call_id, crop=crop, duration=duration,
                             transcript=transcript.strip(), audio_url=audio_url, category=category or None,
                             channel="chat" if channel == "chat" else "voice")
    return _result(q, engine, c.language)


@r.post("/call/{call_id}/photo")
def photo(call_id: int, crop: str = Form(""), duration: str = Form(""), category: str = Form(""), transcript: str = Form(""),
          image: UploadFile = File(...), audio: UploadFile | None = File(None), db=Depends(get_db)):
    """WhatsApp door: leaf photo + optional spoken/typed question + optional category."""
    c = db.get(Call, call_id)
    if not c:
        raise HTTPException(404)
    f = db.get(Farmer, c.farmer_id)
    data = image.file.read()
    mime = image.content_type or "image/jpeg"
    name = f"photo{call_id}_{uuid.uuid4().hex[:8]}.{'png' if 'png' in mime else 'jpg'}"
    (config.UPLOAD_DIR / name).write_bytes(data)
    audio_url, engine = None, "vision"
    if audio is not None:
        adata = audio.file.read()
        aname = f"call{call_id}_{uuid.uuid4().hex[:8]}.webm"
        (config.UPLOAD_DIR / aname).write_bytes(adata)
        audio_url = f"/uploads/{aname}"
        said, engine = stt.transcribe(adata, aname, audio.content_type or "audio/webm", crop)
        transcript = (transcript + " " + (said or "")).strip()
    v = llm.analyze_photo(data, mime, trust_router.known_tags(db))
    desc = (v or {}).get("description_ur") or "، ".join((v or {}).get("symptoms_ur") or [])
    question = " ".join(x for x in [transcript, f"(تصویر) {desc}" if desc else ""] if x).strip()
    if not question:
        return {"needs_text": True, "photo_url": f"/uploads/{name}", "vision": None,
                "message": "Photo analysis is unavailable right now. Add a spoken or typed question and send again."}
    q = trust_router.process(db, farmer=f, call_id=call_id, crop=crop or (v or {}).get("crop", ""), duration=duration,
                             transcript=question, channel="photo", photo_url=f"/uploads/{name}", audio_url=audio_url,
                             vision=v, category=category or None)
    res = _result(q, engine, c.language)
    res["vision"] = v
    return res


@r.post("/query/{qid}/to-expert")
def to_expert(qid: int, source: str = "", db=Depends(get_db)):
    """The farmer can always ask for a human agronomist, even after an AI answer."""
    from datetime import timedelta
    q = db.get(Query, qid)
    if not q:
        raise HTTPException(404)
    if q.status in ("answered_ai", "approved"):
        prev = q.final_answer or q.ai_answer
        q.understanding = {**(q.understanding or {}), "previous_answer": prev, "followup_at": now().isoformat()}
        q.status, q.route, q.priority = "queued", q.route if q.route != "ai" else "junior", max(q.priority, 2)
        followup = source == "followup"  # the 3-day follow-up call: "the problem is still there"
        tag = "followup_still_a_problem" if followup else "farmer_requested_expert"
        q.reasons = [r for r in (q.reasons or []) if r != tag] + [tag]
        q.sla_due_at = now() + timedelta(hours=config.SLA_HOURS["normal"])
        db.add(EventLog(kind="followup" if followup else "query",
                        message=(f"3-day follow-up: farmer says the problem is still there on #{q.id}, back to the experts"
                                 if followup else f"Farmer asked for a human expert on #{q.id}")))
        db.commit()
        hub.publish("expert", "farmer_followup" if followup else "new_query", {"id": q.id, "priority": q.priority, "tehsil": q.tehsil, "crop": q.crop, "transcript": q.transcript,
                                                  "previous_answer": prev})
        hub.publish("admin", "query", {"id": q.id, "status": q.status})
    return {"ok": True, "status": q.status}


class ConsentIn(BaseModel):
    keep: bool


@r.post("/call/{call_id}/consent")
def consent(call_id: int, body: ConsentIn, db=Depends(get_db)):
    c = db.get(Call, call_id)
    if not c:
        raise HTTPException(404)
    c.consent_recording, c.ended_at = body.keep, now()
    moved = deleted = 0
    for p in config.UPLOAD_DIR.glob(f"call{call_id}_*"):
        if body.keep:
            shutil.move(str(p), config.RECORDING_DIR / p.name)
            moved += 1
        else:
            p.unlink(missing_ok=True)
            deleted += 1
    for q in db.query(Query).filter(Query.call_id == call_id):
        if q.audio_url:
            q.audio_url = f"/recordings/{q.audio_url.split('/')[-1]}" if body.keep else None
    db.add(EventLog(kind="consent", message=f"Call {call_id}: recording {'KEPT (' + str(moved) + ' files)' if body.keep else 'DELETED (' + str(deleted) + ' files)'}"))
    db.commit()
    hub.publish("admin", "consent", {"call_id": call_id, "keep": body.keep})
    return {"ok": True, "kept": moved, "deleted": deleted}


@r.get("/farmer/{farmer_id}/inbox")
def inbox(farmer_id: int, db=Depends(get_db)):
    items = db.query(InboxItem).filter(InboxItem.farmer_id == farmer_id).order_by(InboxItem.id.desc()).all()
    channels = {q.id: q.channel for q in db.query(Query).filter(Query.farmer_id == farmer_id)}
    return [{"id": i.id, "kind": i.kind, "title_ur": i.title_ur, "text_ur": i.text_ur, "audio_url": i.audio_url,
             "query_id": i.query_id, "heard": i.heard, "created_at": iso(i.created_at),
             "channel": channels.get(i.query_id, "voice")} for i in items]


@r.post("/inbox/{item_id}/heard")
def heard(item_id: int, db=Depends(get_db)):
    i = db.get(InboxItem, item_id)
    if i:
        i.heard = True
        db.commit()
    return {"ok": True}


@r.get("/farmer/{farmer_id}/queries")
def farmer_queries(farmer_id: int, db=Depends(get_db)):
    qs = db.query(Query).filter(Query.farmer_id == farmer_id).order_by(Query.id.desc()).limit(10).all()
    return [query_out(q) for q in qs]


@r.get("/farmer/lookup")
def lookup(phone: str, db=Depends(get_db)):
    f = db.query(Farmer).filter(Farmer.phone_hash == seed.hash_phone(phone)).first()
    return {"farmer_id": f.id if f else None, "tehsil": f.tehsil if f else None}


@r.get("/status")
def status():
    return {"offline": state.is_offline()}
