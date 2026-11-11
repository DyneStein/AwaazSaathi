"""The trust router: transcript -> understand -> retrieve -> compose -> nil detection -> AI answer OR expert queue."""
from datetime import timedelta

from .. import config
from ..models import EventLog, Farmer, KBEntry, Query, now
from ..ws import hub
from . import llm, nil_detection, outbreak, retrieval, tts


def known_tags(db) -> list[str]:
    return sorted({t for (t,) in db.query(KBEntry.disease_tag).distinct()})


def process(db, *, farmer: Farmer, call_id: int | None, crop: str, duration: str, transcript: str,
            channel: str = "voice", photo_url: str | None = None, audio_url: str | None = None,
            vision: dict | None = None) -> Query:
    tags = known_tags(db)
    und = llm.understand(transcript, crop, duration, tags) or {}
    normalized = und.get("normalized_query_ur") or transcript
    search_text = " ".join([transcript, normalized, " ".join(und.get("symptoms_ur") or []),
                            (vision or {}).get("description_ur", ""), " ".join((vision or {}).get("symptoms_ur") or [])])
    hits = retrieval.index.search(search_text, crop=crop or und.get("crop"))
    top, top_score = (hits[0] if hits else (None, 0.0))

    answer, grounding = "", 0.0
    if top and top_score >= config.RETRIEVAL_MIN:
        passages = [top.answer_ur]
        composed = llm.compose(normalized, passages) if config.COMPOSE_WITH_LLM else None
        answer = composed or top.answer_ur  # offline / LLM down: the expert-reviewed KB text verbatim
        grounding = nil_detection.grounding_score(answer, passages)

    tag = und.get("disease_tag")
    if tag not in tags:
        tag = (vision or {}).get("disease_tag") if (vision or {}).get("disease_tag") in tags else None
    if not tag and top and top_score >= config.RETRIEVAL_MIN:
        tag = top.disease_tag
    prior = outbreak.count_cases(db, farmer.tehsil, tag, exclude_farmer=farmer.id) if tag else 0

    d = nil_detection.decide(
        transcript=transcript, retrieval_score=top_score, grounding=grounding,
        top_senior_only=bool(top and top.senior_only and top_score >= config.RETRIEVAL_MIN),
        llm_asks_dose=bool(und.get("asks_dose")), llm_chemicals=und.get("chemicals") or [],
        llm_spread=bool(und.get("spread")), prior_similar_cases=prior)

    q = Query(call_id=call_id, farmer_id=farmer.id, tehsil=farmer.tehsil, crop=crop or und.get("crop") or "",
              duration=duration, channel=channel, transcript=transcript, normalized_query=normalized,
              disease_tag=tag, understanding={**und, "vision": vision} if vision else und,
              photo_url=photo_url, audio_url=audio_url, ai_answer=answer,
              retrieved=[{"kb_id": h.id, "title_ur": h.title_ur, "score": round(s, 3), "answer_ur": h.answer_ur,
                          "senior_only": h.senior_only} for h, s in hits],
              retrieval_score=round(top_score, 3), grounding=round(grounding, 3), route=d.route, reasons=d.reasons)

    if not d.escalate:
        q.status, q.answered_by, q.answered_at = "answered_ai", "AI", now()
        q.final_answer = answer
        q.final_audio_url = tts.speak(answer)
    else:
        q.status = "queued"
        outbreak_suspect = any(r.startswith("suspected_outbreak") for r in d.reasons)
        q.priority = 3 if outbreak_suspect else (2 if d.route == "senior_only" else 1)
        sla = config.SLA_HOURS["senior_only" if d.route == "senior_only" else ("high" if q.priority >= 2 else "normal")]
        q.sla_due_at = now() + timedelta(hours=sla)
    db.add(q)
    db.add(EventLog(kind="query", message=f"Q from {farmer.tehsil} ({crop}): {'AI answered' if not d.escalate else 'ESCALATED ' + '; '.join(d.reasons)}"))
    db.commit()

    outbreak.check(db, q)
    if d.escalate:
        hub.publish("expert", "new_query", {"id": q.id, "priority": q.priority, "route": q.route})
    hub.publish("admin", "query", {"id": q.id, "status": q.status})
    return q
