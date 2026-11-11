"""Database models. One SQLite DB, four table groups by prefix: farmer_, dealer_, expert_, core_."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------- farmer ----------------
class Farmer(Base):
    """Privacy: only a salted hash of the phone number and the tehsil are stored. Never the raw number."""
    __tablename__ = "farmer_farmer"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tehsil: Mapped[str] = mapped_column(String(64))
    language: Mapped[str] = mapped_column(String(8), default="pa")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class InboxItem(Base):
    __tablename__ = "farmer_inbox"
    id: Mapped[int] = mapped_column(primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmer_farmer.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))  # callback | outbreak_alert
    title_ur: Mapped[str] = mapped_column(Text)
    text_ur: Mapped[str] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    query_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    heard: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------- dealer ----------------
class Dealer(Base):
    __tablename__ = "dealer_dealer"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    shop: Mapped[str] = mapped_column(String(120))
    tehsil: Mapped[str] = mapped_column(String(64))
    pin: Mapped[str] = mapped_column(String(8))  # demo login only


class DealerAlert(Base):
    __tablename__ = "dealer_alert"
    id: Mapped[int] = mapped_column(primary_key=True)
    dealer_id: Mapped[int] = mapped_column(ForeignKey("dealer_dealer.id"), index=True)
    outbreak_id: Mapped[int] = mapped_column(ForeignKey("core_outbreak.id"))
    products: Mapped[list] = mapped_column(JSON)
    demand_count: Mapped[int] = mapped_column(Integer, default=0)
    distance_note: Mapped[str] = mapped_column(String(64), default="")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------- expert ----------------
class Expert(Base):
    __tablename__ = "expert_expert"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    level: Mapped[str] = mapped_column(String(12))  # junior | verified | senior
    verification_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|verified|rejected (MOCK review)
    degree: Mapped[str] = mapped_column(String(120), default="")
    degree_file: Mapped[str | None] = mapped_column(String(256), nullable=True)
    specialties: Mapped[list] = mapped_column(JSON, default=list)
    reviewed_count: Mapped[int] = mapped_column(Integer, default=0)
    clean_count: Mapped[int] = mapped_column(Integer, default=0)   # approved without major edit
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    reviews_done: Mapped[int] = mapped_column(Integer, default=0)  # as a senior reviewer
    earnings_pkr: Mapped[int] = mapped_column(Integer, default=0)  # MOCK sponsor-funded balance
    sponsor: Mapped[str] = mapped_column(String(80), default="")


class ScoreEvent(Base):
    __tablename__ = "expert_score_event"
    id: Mapped[int] = mapped_column(primary_key=True)
    expert_id: Mapped[int] = mapped_column(ForeignKey("expert_expert.id"), index=True)
    outcome: Mapped[str] = mapped_column(String(16))  # clean | major_edit | rejected
    score_after: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Draft(Base):
    __tablename__ = "expert_draft"
    id: Mapped[int] = mapped_column(primary_key=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("core_query.id"), index=True)
    expert_id: Mapped[int] = mapped_column(ForeignKey("expert_expert.id"))
    text: Mapped[str] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Review(Base):
    __tablename__ = "expert_review"
    id: Mapped[int] = mapped_column(primary_key=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("core_query.id"), index=True)
    draft_id: Mapped[int | None] = mapped_column(ForeignKey("expert_draft.id"), nullable=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("expert_expert.id"))
    action: Mapped[str] = mapped_column(String(16))  # approve | edit_approve | reject
    final_text: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    edit_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------- core ----------------
class KBEntry(Base):
    __tablename__ = "core_kb"
    id: Mapped[int] = mapped_column(primary_key=True)
    crop: Mapped[str] = mapped_column(String(24))
    disease_tag: Mapped[str] = mapped_column(String(48), index=True)
    title_ur: Mapped[str] = mapped_column(Text)
    title_en: Mapped[str] = mapped_column(Text)
    symptoms_ur: Mapped[str] = mapped_column(Text)
    keywords: Mapped[str] = mapped_column(Text, default="")
    answer_ur: Mapped[str] = mapped_column(Text)
    senior_only: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_expert_review: Mapped[bool] = mapped_column(Boolean, default=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="seed")  # seed | promoted
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Call(Base):
    __tablename__ = "core_call"
    id: Mapped[int] = mapped_column(primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmer_farmer.id"))
    language: Mapped[str] = mapped_column(String(8), default="pa")
    consent_recording: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    recording_path: Mapped[str | None] = mapped_column(String(256), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Query(Base):
    __tablename__ = "core_query"
    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[int | None] = mapped_column(ForeignKey("core_call.id"), nullable=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmer_farmer.id"), index=True)
    tehsil: Mapped[str] = mapped_column(String(64), index=True)
    crop: Mapped[str] = mapped_column(String(24), default="")
    duration: Mapped[str] = mapped_column(String(24), default="")
    channel: Mapped[str] = mapped_column(String(12), default="voice")  # voice | photo | text
    transcript: Mapped[str] = mapped_column(Text, default="")
    normalized_query: Mapped[str] = mapped_column(Text, default="")
    disease_tag: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    understanding: Mapped[dict] = mapped_column(JSON, default=dict)
    photo_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    ai_answer: Mapped[str] = mapped_column(Text, default="")
    retrieved: Mapped[list] = mapped_column(JSON, default=list)
    retrieval_score: Mapped[float] = mapped_column(Float, default=0.0)
    grounding: Mapped[float] = mapped_column(Float, default=0.0)
    route: Mapped[str] = mapped_column(String(16), default="ai")  # ai | junior | senior_only
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="answered_ai", index=True)
    # answered_ai | queued | drafted | approved | rejected
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher = first
    assigned_expert_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    escalation_count: Mapped[int] = mapped_column(Integer, default=0)
    final_answer: Mapped[str] = mapped_column(Text, default="")
    final_audio_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    promoted_kb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answered_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Outbreak(Base):
    __tablename__ = "core_outbreak"
    id: Mapped[int] = mapped_column(primary_key=True)
    tehsil: Mapped[str] = mapped_column(String(64))
    crop: Mapped[str] = mapped_column(String(24))
    disease_tag: Mapped[str] = mapped_column(String(48))
    case_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="active")
    weather: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class EventLog(Base):
    """System feed for the admin panel, incl. MOCKED SMS / WhatsApp deliveries."""
    __tablename__ = "core_event"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(24))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Setting(Base):
    __tablename__ = "core_setting"
    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
