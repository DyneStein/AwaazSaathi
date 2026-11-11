from ..models import Expert, Query
from ..pipeline import outbreak, scoring


def iso(d):
    return d.isoformat() + "Z" if d else None


def query_out(q: Query, db=None) -> dict:
    from ..models import Draft, Review
    out = {
        "id": q.id, "farmer_id": q.farmer_id, "tehsil": q.tehsil,
        "tehsil_ur": outbreak.TEHSILS.get(q.tehsil, {}).get("ur", q.tehsil),
        "crop": q.crop, "duration": q.duration, "channel": q.channel, "transcript": q.transcript,
        "normalized_query": q.normalized_query, "disease_tag": q.disease_tag, "photo_url": q.photo_url,
        "audio_url": q.audio_url, "ai_answer": q.ai_answer, "retrieved": q.retrieved,
        "retrieval_score": q.retrieval_score, "grounding": q.grounding, "route": q.route, "reasons": q.reasons,
        "status": q.status, "priority": q.priority, "sla_due_at": iso(q.sla_due_at), "created_at": iso(q.created_at),
        "escalation_count": q.escalation_count, "assigned_expert_id": q.assigned_expert_id,
        "final_answer": q.final_answer, "final_audio_url": q.final_audio_url, "promoted_kb_id": q.promoted_kb_id,
        "answered_by": q.answered_by, "understanding": q.understanding,
    }
    if db is not None:
        drafts = db.query(Draft).filter(Draft.query_id == q.id).order_by(Draft.id).all()
        reviews = db.query(Review).filter(Review.query_id == q.id).order_by(Review.id).all()
        names = {e.id: e.name for e in db.query(Expert).all()}
        out["drafts"] = [{"id": d.id, "expert_id": d.expert_id, "expert": names.get(d.expert_id), "text": d.text,
                          "audio_url": d.audio_url, "created_at": iso(d.created_at)} for d in drafts]
        out["reviews"] = [{"id": r.id, "reviewer": names.get(r.reviewer_id), "action": r.action, "final_text": r.final_text,
                           "reason": r.reason, "edit_ratio": round(r.edit_ratio, 3), "draft_id": r.draft_id,
                           "created_at": iso(r.created_at)} for r in reviews]
    return out


def expert_out(e: Expert) -> dict:
    sc = scoring.score(e.clean_count, e.reviewed_count)
    return {"id": e.id, "name": e.name, "level": e.level, "verification_status": e.verification_status,
            "degree": e.degree, "degree_file": e.degree_file, "specialties": e.specialties,
            "reviewed_count": e.reviewed_count, "clean_count": e.clean_count, "rejected_count": e.rejected_count,
            "reviews_done": e.reviews_done, "score": sc, "earnings_pkr": e.earnings_pkr, "sponsor": e.sponsor,
            "progress": scoring.progress(e.level, e.reviewed_count, sc)}
