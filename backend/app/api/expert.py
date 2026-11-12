"""Expert door: queue, junior drafts, senior review (approve / edit+approve / reject), callback, KB promotion."""
import random
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from .. import config, prompts
from ..db import get_db
from ..models import (Draft, EventLog, Expert, InboxItem, KBEntry, Query, Review, ScoreEvent, now)
from ..pipeline import retrieval, scoring, tts
from ..ws import hub
from .common import expert_out, iso, query_out

r = APIRouter(prefix="/api/expert")


@r.get("/list")
def experts(db=Depends(get_db)):
    return [expert_out(e) for e in db.query(Expert).order_by(Expert.id)]


@r.get("/kb")
def knowledge(q: str = "", crop: str = "", db=Depends(get_db)):
    """The knowledge base the AI answers from: what experts browse, check and extend."""
    rows = db.query(KBEntry).order_by(KBEntry.id.desc()).all()
    if crop:
        rows = [k for k in rows if k.crop == crop]
    if q.strip():
        rank = {d.id: i for i, (d, s) in enumerate(retrieval.index.search(q, k=8)) if s > 0.05}
        rows = sorted((k for k in rows if k.id in rank), key=lambda k: rank[k.id])   # best match first
    return [{"id": k.id, "crop": k.crop, "disease_tag": k.disease_tag, "title_ur": k.title_ur, "title_en": k.title_en,
             "symptoms_ur": k.symptoms_ur, "answer_ur": k.answer_ur, "senior_only": k.senior_only, "source": k.source,
             "needs_expert_review": k.needs_expert_review, "reviewed_by": k.reviewed_by, "reviewed_at": iso(k.reviewed_at)}
            for k in rows]


class SignOffIn(BaseModel):
    reviewer_id: int


@r.post("/kb/{kb_id}/sign-off")
def sign_off(kb_id: int, body: SignOffIn, db=Depends(get_db)):
    """A senior agronomist confirms a seed entry is correct. Until then it is shown as awaiting sign-off."""
    k, rev = db.get(KBEntry, kb_id), db.get(Expert, body.reviewer_id)
    if not k or not rev:
        raise HTTPException(404)
    if rev.level != "senior":
        raise HTTPException(403, "Only senior agronomists can sign off knowledge entries.")
    k.needs_expert_review, k.reviewed_by, k.reviewed_at = False, rev.name, now()
    db.add(EventLog(kind="kb", message=f"{rev.name} signed off knowledge entry #{k.id} ({k.title_en})"))
    db.commit()
    retrieval.rebuild(db)
    hub.publish("expert", "kb_signed", {"kb_id": k.id})
    return {"ok": True, "reviewed_by": rev.name}


@r.get("/{expert_id}/profile")
def profile(expert_id: int, db=Depends(get_db)):
    e = db.get(Expert, expert_id)
    if not e:
        raise HTTPException(404)
    hist = db.query(ScoreEvent).filter(ScoreEvent.expert_id == e.id).order_by(ScoreEvent.id).all()
    return {**expert_out(e), "history": [{"outcome": h.outcome, "score": h.score_after, "at": iso(h.created_at)} for h in hist[-40:]],
            "thresholds": config.PROMOTION, "major_edit_ratio": config.MAJOR_EDIT_RATIO}


@r.get("/queue")
def queue(expert_id: int, crop: str = "", tehsil: str = "", show: str = "open", db=Depends(get_db)):
    e = db.get(Expert, expert_id)
    if not e:
        raise HTTPException(404)
    q = db.query(Query)
    if show == "open":
        q = q.filter(Query.status.in_(["queued", "drafted"]))
    else:
        q = q.filter(Query.status == "approved").order_by(Query.answered_at.desc())
    if crop:
        q = q.filter(Query.crop == crop)
    if tehsil:
        q = q.filter(Query.tehsil == tehsil)
    items = q.order_by(Query.priority.desc(), Query.created_at.asc()).limit(50).all()
    out = []
    for item in items:
        d = query_out(item, db)
        d["can_draft"] = item.status == "queued" and (item.route != "senior_only" or e.level == "senior")
        d["can_finalize"] = scoring.can_handle(e.level, item.route) and e.verification_status == "verified"
        d["can_review"] = e.level == "senior" and item.status == "drafted"
        out.append(d)
    return out


@r.get("/query/{qid}")
def get_query(qid: int, db=Depends(get_db)):
    q = db.get(Query, qid)
    if not q:
        raise HTTPException(404)
    return query_out(q, db)


@r.post("/upload-audio")
def upload_audio(audio: UploadFile = File(...)):
    name = f"expert_{uuid.uuid4().hex[:10]}.webm"
    (config.UPLOAD_DIR / name).write_bytes(audio.file.read())
    return {"audio_url": f"/uploads/{name}"}


def finalize(db, q: Query, text: str, by: Expert, audio_url: str | None = None) -> None:
    """Approved answer -> TTS -> voice callback to the farmer (+ MOCK SMS/WhatsApp backup)."""
    q.final_answer, q.status, q.answered_at, q.answered_by = text, "approved", now(), by.name
    from ..models import Farmer
    farmer = db.get(Farmer, q.farmer_id)
    full = prompts.prompts_for(farmer.language if farmer else "ur")["callback_intro"] + " " + text
    q.final_audio_url = tts.speak(full)
    db.add(InboxItem(farmer_id=q.farmer_id, kind="callback", title_ur="ماہر کا جواب", text_ur=text,
                     audio_url=q.final_audio_url, query_id=q.id))
    db.add(EventLog(kind="callback", message=f"Voice callback queued for query #{q.id} (approved by {by.name})"))
    db.add(EventLog(kind="sms_mock", message=f"[MOCK SMS/WhatsApp] backup text of answer #{q.id} sent to farmer"))
    db.commit()
    hub.publish(f"farmer:{q.farmer_id}", "callback", {"query_id": q.id, "text": text, "audio_url": q.final_audio_url,
                                                     "expert_audio_url": audio_url, "by": by.name, "channel": q.channel})
    hub.publish("expert", "query_updated", {"id": q.id, "status": q.status})
    hub.publish("admin", "callback", {"query_id": q.id})


class DraftIn(BaseModel):
    expert_id: int
    text: str
    audio_url: str | None = None


@r.post("/query/{qid}/draft")
def draft(qid: int, body: DraftIn, db=Depends(get_db)):
    q, e = db.get(Query, qid), db.get(Expert, body.expert_id)
    if not q or not e:
        raise HTTPException(404)
    if q.status not in ("queued", "drafted"):
        raise HTTPException(409, "already answered")
    if e.verification_status != "verified":
        raise HTTPException(403, "Your degree verification is still pending.")
    if q.route == "senior_only" and e.level != "senior":
        raise HTTPException(403, "Senior-only topic (dose / banned chemical / outbreak).")
    if not body.text.strip():
        raise HTTPException(400, "empty answer")
    d = Draft(query_id=q.id, expert_id=e.id, text=body.text.strip(), audio_url=body.audio_url)
    db.add(d)
    db.flush()
    spot = False
    if e.level == "senior" or (e.level == "verified" and q.route != "senior_only"):
        # Seniors answer directly. Verified experts answer low-risk topics directly, with random spot checks.
        spot = e.level == "verified" and random.random() < 0.2
        if spot:
            db.add(EventLog(kind="spot_check", message=f"Random spot check: {e.name}'s answer #{q.id} sent for senior review"))
            q.status = "drafted"
            db.commit()
        else:
            db.add(Review(query_id=q.id, draft_id=d.id, reviewer_id=e.id, action="approve", final_text=d.text))
            db.commit()
            finalize(db, q, d.text, e, body.audio_url)
            return {"ok": True, "status": "approved"}
    else:
        q.status = "drafted"
        db.add(EventLog(kind="draft", message=f"{e.name} (junior) drafted an answer for #{q.id}, awaiting senior review"))
        db.commit()
    hub.publish("expert", "query_updated", {"id": q.id, "status": q.status})
    return {"ok": True, "status": q.status, "spot_check": spot}


class ReviewIn(BaseModel):
    reviewer_id: int
    action: str  # approve | edit_approve | reject
    final_text: str = ""
    reason: str = ""


@r.post("/query/{qid}/review")
def review(qid: int, body: ReviewIn, db=Depends(get_db)):
    q, rev = db.get(Query, qid), db.get(Expert, body.reviewer_id)
    if not q or not rev:
        raise HTTPException(404)
    if rev.level != "senior":
        raise HTTPException(403, "Only senior agronomists can review.")
    d = db.query(Draft).filter(Draft.query_id == q.id).order_by(Draft.id.desc()).first()
    if not d or q.status != "drafted":
        raise HTTPException(409, "nothing to review")
    author = db.get(Expert, d.expert_id)
    final = d.text if body.action == "approve" else body.final_text.strip()
    if body.action == "reject" and not body.reason.strip():
        raise HTTPException(400, "A reason is required to reject.")
    if body.action == "edit_approve" and not final:
        raise HTTPException(400, "empty answer")
    ratio = scoring.edit_ratio(d.text, final) if body.action != "reject" else 1.0
    result = scoring.outcome(body.action, ratio)
    scoring.apply_outcome(author, result)
    sc = scoring.score(author.clean_count, author.reviewed_count)
    db.add(ScoreEvent(expert_id=author.id, outcome=result, score_after=sc))
    db.add(Review(query_id=q.id, draft_id=d.id, reviewer_id=rev.id, action=body.action, final_text=final if body.action != "reject" else "",
                  reason=body.reason, edit_ratio=ratio))
    # MOCK payouts (sponsor-funded): senior paid per review; junior sponsor credit per clean approval
    rev.reviews_done += 1
    rev.earnings_pkr += config.SENIOR_PAY_PER_REVIEW_PKR
    if result == "clean" and author.sponsor:
        author.earnings_pkr += config.JUNIOR_SPONSOR_PER_APPROVED_PKR
    promoted_to = scoring.next_level(author.level, author.reviewed_count, sc)
    if promoted_to:
        db.add(EventLog(kind="promotion", message=f"{author.name} promoted {author.level} -> {promoted_to} "
                                                  f"({author.reviewed_count} reviewed, score {sc:.0%})"))
        author.level = promoted_to
    db.commit()
    hub.publish("expert", "score", {"expert_id": author.id, "outcome": result, "score": sc, "promoted_to": promoted_to})
    if body.action == "reject":
        q.status = "queued"
        db.add(EventLog(kind="reject", message=f"{rev.name} rejected draft for #{q.id}: {body.reason}"))
        db.commit()
        hub.publish("expert", "query_updated", {"id": q.id, "status": q.status})
        return {"ok": True, "status": "queued", "outcome": result, "score": sc}
    finalize(db, q, final, rev, d.audio_url)
    return {"ok": True, "status": "approved", "outcome": result, "score": sc, "promoted_to": promoted_to}


class PromoteIn(BaseModel):
    reviewer_id: int
    title_ur: str = ""


@r.post("/query/{qid}/promote")
def promote(qid: int, body: PromoteIn, db=Depends(get_db)):
    q, rev = db.get(Query, qid), db.get(Expert, body.reviewer_id)
    if not q or not rev:
        raise HTTPException(404)
    if rev.level != "senior":
        raise HTTPException(403, "Only seniors can add answers to the knowledge base.")
    if q.status != "approved" or not q.final_answer:
        raise HTTPException(409, "Only senior-approved answers can be promoted.")
    if q.promoted_kb_id:
        return {"ok": True, "kb_id": q.promoted_kb_id}
    tag = q.disease_tag or f"{q.crop or 'general'}_expert_{q.id}"
    und = q.understanding or {}
    e = KBEntry(crop=q.crop or und.get("crop") or "general", disease_tag=tag,
                title_ur=body.title_ur or q.normalized_query[:80], title_en=f"Expert answer #{q.id}",
                symptoms_ur="، ".join([q.transcript, q.normalized_query] + list(und.get("symptoms_ur") or [])),
                keywords="", answer_ur=q.final_answer, senior_only=q.route == "senior_only" and any(
                    r.startswith(("dose", "banned")) for r in (q.reasons or [])),
                needs_expert_review=False, reviewed_by=rev.name, reviewed_at=now(), source="promoted")
    db.add(e)
    db.flush()
    q.promoted_kb_id = e.id
    if not q.disease_tag:
        q.disease_tag = tag
    db.add(EventLog(kind="kb", message=f"{rev.name} promoted answer #{q.id} into the knowledge base (KB #{e.id})"))
    db.commit()
    retrieval.rebuild(db)
    hub.publish("expert", "kb_promoted", {"query_id": q.id, "kb_id": e.id})
    hub.publish("admin", "kb_promoted", {"query_id": q.id, "kb_id": e.id})
    return {"ok": True, "kb_id": e.id}


@r.post("/{expert_id}/degree")
def upload_degree(expert_id: int, file: UploadFile = File(...), db=Depends(get_db)):
    e = db.get(Expert, expert_id)
    if not e:
        raise HTTPException(404)
    name = f"degree_{expert_id}_{uuid.uuid4().hex[:6]}_{(file.filename or 'degree').replace('/', '_')}"
    (config.UPLOAD_DIR / name).write_bytes(file.file.read())
    e.degree_file, e.verification_status = name, "pending"
    db.add(EventLog(kind="verification", message=f"{e.name} uploaded degree - awaiting admin verification (MOCK)"))
    db.commit()
    hub.publish("admin", "verification", {"expert_id": e.id})
    return expert_out(e)


def sla_sweep(db) -> int:
    """Auto-escalation: any open query past its SLA is reassigned to another senior with a fresh SLA."""
    seniors = [e for e in db.query(Expert).filter(Expert.level == "senior").order_by(Expert.id)]
    n = 0
    for q in db.query(Query).filter(Query.status.in_(["queued", "drafted"]), Query.sla_due_at < now()):
        if not seniors:
            break
        current = q.assigned_expert_id
        nxt = next((s for s in seniors if s.id != current), seniors[0])
        q.assigned_expert_id = nxt.id
        q.escalation_count += 1
        q.priority = max(q.priority, 2)
        q.sla_due_at = now() + timedelta(hours=1)
        db.add(EventLog(kind="sla", message=f"SLA breached on #{q.id}: auto-escalated to {nxt.name}"))
        n += 1
    if n:
        db.commit()
        hub.publish("expert", "sla", {"count": n})
    return n
