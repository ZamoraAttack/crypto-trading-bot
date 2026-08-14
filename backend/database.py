from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer,
    String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import cfg


engine = create_async_engine(cfg.database_url, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


class Base(DeclarativeBase):
    pass


class Signal(Base):
    __tablename__ = "signals"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    bot_name         = Column(String(50), nullable=False, default="crypto")
    symbol           = Column(String(100), nullable=False, index=True)
    final_score      = Column(Float, nullable=True)
    social_score     = Column(Float, nullable=True)
    volume_score     = Column(Float, nullable=True)
    price_score      = Column(Float, nullable=True)
    action           = Column(String(20), nullable=False, default="watching")
    rejection_reason = Column(String(200), nullable=True)
    trade_id         = Column(UUID(as_uuid=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Trade(Base):
    __tablename__ = "trades"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bot_name          = Column(String(50), nullable=False, default="crypto")
    symbol            = Column(String(100), nullable=False, index=True)
    mode              = Column(String(10), nullable=False, default="paper")
    side              = Column(String(10), nullable=False, default="buy")
    entry_price       = Column(Float, nullable=False)
    exit_price        = Column(Float, nullable=True)
    quantity          = Column(Float, nullable=False)
    cost_usd          = Column(Float, nullable=False)
    pnl_usd           = Column(Float, nullable=True)
    pnl_pct           = Column(Float, nullable=True)
    status            = Column(String(20), nullable=False, default="open")
    strategy          = Column(String(100), nullable=True)
    extra             = Column("metadata", JSONB, nullable=True)
    opened_at         = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at         = Column(DateTime(timezone=True), nullable=True)
    # Bot-specific fields (added to Postgres via ALTER TABLE)
    signal_id         = Column(BigInteger, nullable=True)
    stop_loss_price   = Column(Float, nullable=True)
    take_profit_price = Column(Float, nullable=True)
    coinbase_order_id = Column(String(64), nullable=True)


class DailyRisk(Base):
    __tablename__ = "daily_risk"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    date             = Column(Date, unique=True, nullable=False, index=True)
    starting_balance = Column(Float, nullable=False)
    current_balance  = Column(Float, nullable=False)
    realized_pnl     = Column(Float, nullable=False, default=0.0)
    pnl_pct          = Column(Float, nullable=False, default=0.0)
    trades_count     = Column(Integer, nullable=False, default=0)
    trading_halted   = Column(Boolean, nullable=False, default=False)
    halt_reason      = Column(Text, nullable=True)


class SystemEvent(Base):
    __tablename__ = "system_events"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    event_type  = Column(String(32), nullable=False, index=True)
    asset       = Column(String(16), nullable=True)
    message     = Column(Text, nullable=False)
    data        = Column(Text, nullable=True)


class Memory(Base):
    __tablename__ = "memories"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    category   = Column(String(30), nullable=False, index=True)  # decision | goal | business_knowledge | relationship | conversation | experiment | outcome | agent_history
    title      = Column(String(200), nullable=False)
    content    = Column(Text, nullable=False)
    extra      = Column("metadata", JSONB, nullable=True)
    source     = Column(String(30), nullable=False, default="manual")  # manual | voice | <future agent name>
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── ZAMO Executive Operating System ─────────────────────────────────────────
# Shared contracts for the Mission Control Loop (Ch5) and Executive Departments
# (Ch6) — see backend/intelligence/. All tables prefixed `zamo_` to stay
# visually distinct from the trading-bot tables above within the same shared
# `tradingdb`. Base.metadata.create_all() below is a bootstrap mechanism for
# this first slice, not the permanent migration strategy — Alembic is tracked
# as required follow-up before production maturity (see the Phase 4B plan).


class ZamoDepartment(Base):
    """Identity + activation status only. Mission counts/activity are derived
    at read time from ZamoMission — ZamoMission.state is the source of truth,
    this table is never a cache of it."""
    __tablename__ = "zamo_departments"

    slug       = Column(String(50), primary_key=True)   # e.g. "research"
    name       = Column(String(100), nullable=False)
    status     = Column(String(20), nullable=False, default="planned")  # active | planned
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ZamoMission(Base):
    __tablename__ = "zamo_missions"

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title                  = Column(String(200), nullable=False)
    objective              = Column(Text, nullable=False)
    department_slug        = Column(String(50), ForeignKey("zamo_departments.slug"), nullable=False, index=True)
    success_criteria       = Column(Text, nullable=True)
    evidence_justification = Column(Text, nullable=True)
    constraints            = Column(JSONB, nullable=True)
    authority_granted      = Column(String(10), nullable=False, default="read")   # read | draft | execute
    # Ch5 Mission Health states, stored lowercase_with_underscores:
    # proposed|approved|planning|delegated|in_progress|waiting|blocked|review|completed|learning|archived
    state                  = Column(String(20), nullable=False, default="proposed", index=True)
    # Ch5 Prioritization factors: {strategic_alignment, impact, urgency, dependency, confidence, capacity}
    priority               = Column(JSONB, nullable=True)
    priority_score         = Column(Float, nullable=True)
    created_by             = Column(String(20), nullable=False, default="founder")  # founder | zamo
    # Mission execution durability (BackgroundTasks is temporary infra — see plan
    # refinement 2): updated at each Mission Control Loop step so a startup
    # reconciliation pass can detect a process that died mid-mission.
    last_heartbeat_at      = Column(DateTime(timezone=True), nullable=True)
    attempt_count          = Column(Integer, nullable=False, default=0)
    blocked_reason         = Column(Text, nullable=True)
    # Token usage foundation for a future AI-operating-budget feature — not
    # built yet, just captured so the data exists when that work starts.
    input_tokens           = Column(Integer, nullable=True)
    output_tokens          = Column(Integer, nullable=True)
    estimated_cost_usd     = Column(Float, nullable=True)
    created_at             = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at             = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ZamoObservation(Base):
    """Structured, bounded evidence — the distilled finding, not the raw
    connector payload (plan refinement 3)."""
    __tablename__ = "zamo_observations"

    id                        = Column(BigInteger, primary_key=True, autoincrement=True)
    mission_id                = Column(UUID(as_uuid=True), ForeignKey("zamo_missions.id"), nullable=False, index=True)
    source_type               = Column(String(50), nullable=False)   # e.g. "web_search"
    source_reference          = Column(Text, nullable=True)          # URL / query / identifier
    retrieved_at              = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    extracted_evidence        = Column(Text, nullable=False)
    sensitivity_classification = Column(String(20), nullable=True)
    # Ch3 "Principles of Observation" — each 0..1
    relevance                 = Column(Float, nullable=True)
    impact                    = Column(Float, nullable=True)
    urgency                   = Column(Float, nullable=True)
    novelty                   = Column(Float, nullable=True)
    persistence                = Column(Float, nullable=True)
    created_at                = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ZamoRecommendation(Base):
    __tablename__ = "zamo_recommendations"

    id                     = Column(BigInteger, primary_key=True, autoincrement=True)
    mission_id             = Column(UUID(as_uuid=True), ForeignKey("zamo_missions.id"), nullable=False, index=True)
    summary                = Column(Text, nullable=False)             # what is happening
    reasoning              = Column(Text, nullable=False)             # why it matters
    action_recommended     = Column(Text, nullable=False)             # what to do
    evidence               = Column(JSONB, nullable=True)             # [{observation_id, note}]
    confidence             = Column(Float, nullable=True)
    alternatives_considered = Column(JSONB, nullable=True)
    assumptions            = Column(JSONB, nullable=True)
    uncertainty            = Column(Text, nullable=True)
    # Computed from authority_granted + the action's tier — never hardcoded
    # per department (plan refinement 7 / Ch9 tiering).
    requires_approval      = Column(Boolean, nullable=False, default=False)
    created_at             = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ZamoApproval(Base):
    """Approval and execution are separate architectural events (plan
    refinement 4) — `approved` records the decision only; `executed`/`failed`
    are later, distinct transitions."""
    __tablename__ = "zamo_approvals"

    id                 = Column(BigInteger, primary_key=True, autoincrement=True)
    recommendation_id  = Column(BigInteger, ForeignKey("zamo_recommendations.id"), nullable=False, index=True)
    mission_id         = Column(UUID(as_uuid=True), ForeignKey("zamo_missions.id"), nullable=False, index=True)
    # pending|approved|rejected|expired|cancelled|superseded|executed|failed
    status             = Column(String(20), nullable=False, default="pending", index=True)
    requested_action   = Column(Text, nullable=False)
    risk               = Column(Text, nullable=True)
    reversibility       = Column(String(20), nullable=True)   # reversible | partially_reversible | irreversible
    required_authority = Column(String(20), nullable=False, default="founder")
    decided_by          = Column(String(50), nullable=True)
    decided_at          = Column(DateTime(timezone=True), nullable=True)
    decision_note        = Column(Text, nullable=True)
    created_at            = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ZamoKnowledgeObject(Base):
    """The real Organizational Knowledge System (Ch4) — built in parallel with
    the legacy `Memory` table above, which stays untouched as a compatibility
    layer for the existing chat assistant (plan decision #1: no migration)."""
    __tablename__ = "zamo_knowledge_objects"

    id                = Column(BigInteger, primary_key=True, autoincrement=True)
    # Ch4 taxonomy exactly: strategic|operational|relationship|financial|
    # technical|market|experimental|decision — one required primary category.
    category          = Column(String(30), nullable=False, index=True)
    tags              = Column(JSONB, nullable=True)   # optional cross-cutting labels, plan refinement 6
    title             = Column(String(200), nullable=False)
    content           = Column(Text, nullable=False)
    source            = Column(String(100), nullable=True)   # department slug that produced it
    mission_id        = Column(UUID(as_uuid=True), ForeignKey("zamo_missions.id"), nullable=True, index=True)
    evidence          = Column(JSONB, nullable=True)
    confidence        = Column(Float, nullable=True)
    validation_history = Column(JSONB, nullable=True)
    # captured|validated|active|refined|archived|retired
    lifecycle_state   = Column(String(20), nullable=False, default="captured")
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ZamoKnowledgeRelationship(Base):
    """Makes the Knowledge System a graph (Ch4), not another flat table.
    from/to ids stored as strings to uniformly reference both UUID (mission)
    and integer (knowledge object) primary keys without a polymorphic FK."""
    __tablename__ = "zamo_knowledge_relationships"

    id                = Column(BigInteger, primary_key=True, autoincrement=True)
    from_type         = Column(String(30), nullable=False)   # "knowledge_object" | "mission"
    from_id           = Column(String(50), nullable=False, index=True)
    to_type           = Column(String(30), nullable=False)
    to_id             = Column(String(50), nullable=False, index=True)
    relationship_type = Column(String(30), nullable=False)   # supports | contradicts | supersedes | produced_by
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ZamoOutcome(Base):
    __tablename__ = "zamo_outcomes"

    id                 = Column(BigInteger, primary_key=True, autoincrement=True)
    mission_id         = Column(UUID(as_uuid=True), ForeignKey("zamo_missions.id"), nullable=False, unique=True, index=True)
    what_happened      = Column(Text, nullable=False)
    what_changed       = Column(Text, nullable=True)
    assumptions_held   = Column(JSONB, nullable=True)
    assumptions_failed = Column(JSONB, nullable=True)
    lessons            = Column(Text, nullable=True)
    measured_results   = Column(JSONB, nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
