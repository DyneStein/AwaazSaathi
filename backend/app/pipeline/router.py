"""The trust router: transcript -> understand -> retrieve -> compose -> nil detection -> AI answer OR expert queue."""
from dataclasses import dataclass
from datetime import timedelta

from .. import config
from ..models import EventLog, Farmer, KBEntry, Query, now
from ..ws import hub
from . import llm, nil_detection, outbreak, retrieval, tts


def known_tags(db) -> list[str]:
    return sorted({t for (t,) in db.query(KBEntry.disease_tag).distinct()})


@dataclass
class Assessment:
    hits: list
    top: object | None
    top_score: float
    answer: str
    grounding: float
    tag: str | None
    decision: nil_detection.Decision
    evidence: dict
    normalized: str


def assess(*, transcript: str, crop: str, tags: list[str], und: dict | None = None, vision: dict | None = None,
           category: str | None = None, prior_cases=lambda tag: 0) -> Assessment:
    """Pure decision step (no database writes, no network unless COMPOSE_WITH_LLM): retrieve, ground, apply the rules.
    Used by process() for live calls and by the safety evaluation, so both run exactly the same logic."""
    und, vision = und or {}, vision or {}
    normalized = und.get("normalized_query_ur") or transcript
    search_text = " ".join([transcript, normalized, " ".join(und.get("symptoms_ur") or []),
                            vision.get("description_ur", ""), " ".join(vision.get("symptoms_ur") or [])])
    if category:
        search_text += " " + retrieval.CATEGORY_WORDS.get(category, "")
    chosen = crop or und.get("crop")
    hits = retrieval.index.search(search_text, crop=chosen, category=category)
    top, top_score = (hits[0] if hits else (None, 0.0))
    covered = bool(top and top_score >= config.RETRIEVAL_MIN)

    answer, grounding = "", 0.0
    if covered:
        passages = [top.answer_ur]
        composed = llm.compose(normalized, passages) if config.COMPOSE_WITH_LLM else None
        answer = composed or top.answer_ur  # default: the reviewed knowledge text word for word, the AI writes nothing
        grounding = nil_detection.grounding_score(answer, passages)

    # The problem tag drives outbreak counting, so the language model never sets it alone: a confident retrieval
    # match wins; otherwise the model's or the photo's guess counts only if retrieval also ranked that problem.
    ranked = {h.disease_tag for h, _ in hits}
    if covered:
        tag = top.disease_tag
    else:
        tag = next((t for t in (und.get("disease_tag"), vision.get("disease_tag")) if t in tags and t in ranked), None)

    crop_mismatch = ambiguous = None
    if covered:
        if chosen and chosen != "unknown" and top.crop not in (chosen, "general"):
            crop_mismatch = f"best source is about {top.crop}, farmer chose {chosen}"
        if len(hits) > 1 and hits[1][0].disease_tag != top.disease_tag and top_score - hits[1][1] < config.AMBIGUITY_MARGIN:
            ambiguous = f"{top.disease_tag} {top_score:.2f} vs {hits[1][0].disease_tag} {hits[1][1]:.2f}"

    terms = retrieval.evidence_terms(search_text, top) if top else []
    d = nil_detection.decide(
        transcript=transcript, retrieval_score=top_score, grounding=grounding,
        top_senior_only=bool(covered and top.senior_only),
        # Escalation is decided by explicit keyword rules only. The small local LLM's yes/no flags proved unreliable
        # (it marked simple questions as "spreading"), so they are recorded for experts but never trigger escalation.
        llm_asks_dose=False, llm_chemicals=und.get("chemicals") or [],
        llm_spread=False, prior_similar_cases=prior_cases(tag) if tag else 0,
        crop_mismatch=crop_mismatch, ambiguous=ambiguous, evidence_terms=len(terms))

    evidence = {}
    if top:
        evidence = {"kb_id": top.id, "title_ur": top.title_ur, "title_en": top.title_en, "crop": top.crop,
                    "source": top.source, "reviewed_by": top.reviewed_by,
                    "terms": terms,
                    "margin": round(top_score - hits[1][1], 3) if len(hits) > 1 else None,
                    "verbatim": bool(answer) and answer == top.answer_ur}
    return Assessment(hits, top, top_score, answer, grounding, tag, d, evidence, normalized)


def process(db, *, farmer: Farmer, call_id: int | None, crop: str, duration: str, transcript: str,
            channel: str = "voice", photo_url: str | None = None, audio_url: str | None = None,
            vision: dict | None = None, category: str | None = None) -> Query:
    tags = known_tags(db)
    und = llm.understand(transcript + (f" (category: {category})" if category else ""), crop, duration, tags) or {}
    a = assess(transcript=transcript, crop=crop, tags=tags, und=und, vision=vision, category=category,
               prior_cases=lambda t: outbreak.count_cases(db, farmer.tehsil, t, exclude_farmer=farmer.id))
    hits, top_score, answer, grounding, tag, d, normalized = a.hits, a.top_score, a.answer, a.grounding, a.tag, a.decision, a.normalized

    q = Query(call_id=call_id, farmer_id=farmer.id, tehsil=farmer.tehsil, crop=crop or und.get("crop") or "",
              duration=duration, channel=channel, transcript=transcript, normalized_query=normalized,
              disease_tag=tag, understanding={**und, "vision": vision} if vision else und,
              photo_url=photo_url, audio_url=audio_url, ai_answer=answer,
              retrieved=[{"kb_id": h.id, "title_ur": h.title_ur, "title_en": h.title_en, "crop": h.crop, "score": round(s, 3),
                          "answer_ur": h.answer_ur, "senior_only": h.senior_only} for h, s in hits],
              retrieval_score=round(top_score, 3), grounding=round(grounding, 3), route=d.route, reasons=d.reasons)

    w = outbreak.weather(farmer.tehsil)
    q.understanding = {**(q.understanding or {}), "weather": w, "evidence": a.evidence}
    emergency = any(r.startswith("health_emergency") for r in d.reasons)
    if not d.escalate:
        q.status, q.answered_by, q.answered_at = "answered_ai", "AI", now()
        tip = outbreak.weather_advice(w)  # weather-aware: added after the grounding check, from live forecast rules
        q.final_answer = answer + (" " + tip if tip else "")
        # Every spoken sentence is traceable: either the reviewed knowledge entry or the weather rule.
        q.understanding["answer_parts"] = [{"text": answer, "from": "knowledge", "kb_id": a.evidence.get("kb_id")}] + (
            [{"text": tip, "from": "weather_rule"}] if tip else [])
        answer = q.final_answer
        q.final_audio_url = tts.speak(q.final_answer)
    else:
        q.status = "queued"
        outbreak_suspect = any(r.startswith("suspected_outbreak") for r in d.reasons)
        q.priority = 3 if (outbreak_suspect or emergency) else (2 if d.route == "senior_only" else 1)
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
