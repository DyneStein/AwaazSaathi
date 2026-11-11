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
def get_prompts():
    return {k: {"text": v, "audio_url": tts.speak(v)} for k, v in prompts.PROMPTS.items()}


@r.get("/tts")
def get_tts(text: str):
    return {"audio_url": tts.speak(text)}


@r.get("/demo/personas")
def personas():
    return {"personas": seed.personas(), "tehsils": [{"name": k, "ur": v["ur"]} for k, v in outbreak.TEHSILS.items()],
            "crops": prompts.CROPS, "crop_ur": prompts.CROP_UR, "durations": prompts.DURATIONS,
            "duration_ur": prompts.DURATION_UR,
            "canned": {k: {"label": v["label"], "transcript": v["transcript"], "crop": v["crop"]} for k, v in prompts.CANNED.items()}}


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
            "tehsil_ur": outbreak.TEHSILS.get(f.tehsil, {}).get("ur", f.tehsil), "known": known}


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


def _result(q: Query, engine: str = "") -> dict:
    escalated = q.status != "answered_ai"
    return {"query": query_out(q), "escalated": escalated, "stt_engine": engine,
            "answer_text": q.final_answer if not escalated else prompts.PROMPTS["escalated"],
            "answer_audio": q.final_audio_url if not escalated else tts.speak(prompts.PROMPTS["escalated"])}


@r.post("/call/{call_id}/ask")
def ask(call_id: int, crop: str = Form(""), duration: str = Form(""), transcript: str = Form(""),
        audio: UploadFile | None = File(None), db=Depends(get_db)):
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
            text, engine = stt.transcribe(data, name, audio.content_type or "audio/webm")
            if not text:
                return {"needs_text": True, "stt_engine": engine, "audio_url": audio_url}
            transcript = text
    if not transcript.strip():
        raise HTTPException(400, "empty question")
    q = trust_router.process(db, farmer=f, call_id=call_id, crop=crop, duration=duration,
                             transcript=transcript.strip(), audio_url=audio_url)
    return _result(q, engine)


@r.post("/call/{call_id}/photo")
def photo(call_id: int, crop: str = Form(""), duration: str = Form(""), image: UploadFile = File(...), db=Depends(get_db)):
    c = db.get(Call, call_id)
    if not c:
        raise HTTPException(404)
    f = db.get(Farmer, c.farmer_id)
    data = image.file.read()
    mime = image.content_type or "image/jpeg"
    name = f"photo{call_id}_{uuid.uuid4().hex[:8]}.{'png' if 'png' in mime else 'jpg'}"
    (config.UPLOAD_DIR / name).write_bytes(data)
    tags = trust_router.known_tags(db)
    v = llm.analyze_photo(data, mime, tags)
    if not v:
        return {"needs_text": True, "photo_url": f"/uploads/{name}", "vision": None,
                "message": "Photo analysis unavailable (offline or quota) - describe the problem instead."}
    desc = v.get("description_ur") or "، ".join(v.get("symptoms_ur") or [])
    q = trust_router.process(db, farmer=f, call_id=call_id, crop=crop or v.get("crop", ""), duration=duration,
                             transcript=f"(تصویر) {desc}", channel="photo", photo_url=f"/uploads/{name}", vision=v)
    res = _result(q, "vision")
    res["vision"] = v
    return res


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
    return [{"id": i.id, "kind": i.kind, "title_ur": i.title_ur, "text_ur": i.text_ur, "audio_url": i.audio_url,
             "query_id": i.query_id, "heard": i.heard, "created_at": iso(i.created_at)} for i in items]


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


@r.get("/status")
def status():
    return {"offline": state.is_offline()}
