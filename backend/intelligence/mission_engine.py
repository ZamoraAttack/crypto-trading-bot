"""
Mission Control Loop (Ch5) — one orchestrator every department reuses.
create_mission -> prioritize -> delegate -> execute -> measure/learn ->
remember -> advise. State transitions are enforced here so no department can
skip a step. Reconciliation on startup handles a process that died mid-mission
(plan refinement 2) — BackgroundTasks is temporary execution infrastructure,
not the long-term mission runner (a future Automation phase replaces it
without changing anything above run_mission()).
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from database import (
    AsyncSessionLocal,
    ZamoApproval,
    ZamoKnowledgeObject,
    ZamoKnowledgeRelationship,
    ZamoMission,
    ZamoObservation,
    ZamoOutcome,
    ZamoRecommendation,
)
from intelligence.contracts import DepartmentContract, DepartmentResult, MissionContext
from intelligence.departments import get_department

log = logging.getLogger("zamo.mission_engine")

# Ch5 Mission Health states
VALID_STATES = {
    "proposed", "approved", "planning", "delegated", "in_progress",
    "waiting", "blocked", "review", "completed", "learning", "archived",
}
_HEARTBEAT_STALE_SECONDS = 300  # 5 min — a dead process stops heartbeating

# Hard circuit breaker on shared Anthropic spend (2026-08-14) — a single
# effort=high mission with real web search has been observed costing ~$7;
# a handful of missions in a short window can burn through a modest balance
# without anyone noticing. Reactive, not predictive: blocks a NEW mission
# once the trailing-24h total already meets the cap, rather than trying to
# estimate a mission's cost before it runs. Adjust via env var, no code
# change needed.
_DAILY_COST_CAP_USD = float(os.getenv("ZAMO_DAILY_COST_CAP_USD", "15.0"))


async def _trailing_24h_spend_usd() -> float:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.sum(ZamoMission.estimated_cost_usd)).where(ZamoMission.created_at >= cutoff)
        )
        return result.scalar() or 0.0


async def create_mission(
    *, title: str, objective: str, department_slug: str,
    success_criteria: str | None = None, evidence_justification: str | None = None,
    constraints: dict | None = None, authority_granted: str = "read",
    created_by: str = "founder",
) -> ZamoMission:
    """Persists the mission BEFORE any execution starts (plan refinement 2)."""
    async with AsyncSessionLocal() as db:
        mission = ZamoMission(
            title=title, objective=objective, department_slug=department_slug,
            success_criteria=success_criteria, evidence_justification=evidence_justification,
            constraints=constraints or {}, authority_granted=authority_granted,
            state="proposed", created_by=created_by,
        )
        db.add(mission)
        await db.commit()
        await db.refresh(mission)

    await _prioritize(mission.id)
    await _set_state(mission.id, "delegated")
    return mission


async def _prioritize(mission_id: uuid.UUID) -> None:
    """Ch5 Prioritization — a first pass over what's known at creation time.
    Departments don't influence this step."""
    async with AsyncSessionLocal() as db:
        mission = await db.get(ZamoMission, mission_id)
        if not mission:
            return
        priority = {
            "strategic_alignment": 0.7, "impact": 0.6, "urgency": 0.5,
            "dependency": None, "confidence": 0.6, "capacity": 0.8,
        }
        scored = [v for v in priority.values() if isinstance(v, (int, float))]
        mission.priority = priority
        mission.priority_score = round(sum(scored) / len(scored), 3)
        mission.state = "approved"
        await db.commit()


async def _set_state(mission_id: uuid.UUID, state: str, *, reason: str | None = None) -> None:
    assert state in VALID_STATES, f"invalid mission state: {state}"
    async with AsyncSessionLocal() as db:
        mission = await db.get(ZamoMission, mission_id)
        if not mission:
            return
        mission.state = state
        if reason is not None:
            mission.blocked_reason = reason
        await db.commit()


async def _heartbeat(mission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        mission = await db.get(ZamoMission, mission_id)
        if not mission:
            return
        mission.last_heartbeat_at = datetime.now(timezone.utc)
        await db.commit()


async def run_mission(mission_id: uuid.UUID) -> None:
    """The actual execution — called from a FastAPI BackgroundTask. Temporary
    execution infrastructure (plan refinement 2), not the long-term mission
    runner; a future Automation phase replaces BackgroundTasks with a durable
    job runner without changing anything below this signature."""
    spend = await _trailing_24h_spend_usd()
    if spend >= _DAILY_COST_CAP_USD:
        log.warning(
            "Mission %s blocked — daily AI spend cap reached ($%.2f of $%.2f in the trailing 24h)",
            mission_id, spend, _DAILY_COST_CAP_USD,
        )
        await _set_state(mission_id, "blocked", reason=(
            f"Daily AI spend cap reached (${spend:.2f} of ${_DAILY_COST_CAP_USD:.2f} in the trailing "
            "24h). Raise ZAMO_DAILY_COST_CAP_USD or wait for the window to roll over to run more missions."
        ))
        return

    async with AsyncSessionLocal() as db:
        mission = await db.get(ZamoMission, mission_id)
        if not mission:
            log.error("run_mission: mission %s not found", mission_id)
            return
        mission.attempt_count = (mission.attempt_count or 0) + 1
        mission.state = "in_progress"
        mission.last_heartbeat_at = datetime.now(timezone.utc)
        await db.commit()
        context = MissionContext(
            mission_id=str(mission.id), objective=mission.objective,
            success_criteria=mission.success_criteria,
            evidence_justification=mission.evidence_justification,
            constraints=mission.constraints or {}, authority_granted=mission.authority_granted,
            expected_deliverables=mission.success_criteria,
        )
        department_slug = mission.department_slug

    try:
        department = get_department(department_slug)
        await _heartbeat(mission_id)
        result = await department.execute_mission(context)
        await _heartbeat(mission_id)
        log.info(
            "Mission %s: department returned %d observation(s), %d knowledge_contribution(s)",
            mission_id, len(result.observations), len(result.knowledge_contributions),
        )
    except Exception as exc:
        log.exception("Mission %s failed during execution: %s", mission_id, exc)
        await _set_state(mission_id, "blocked", reason=f"Execution failed: {exc}")
        return

    try:
        await _set_state(mission_id, "review")
        await _persist_recommendation(mission_id, result, department.contract)
        await _record_usage(mission_id, result)
        await _set_state(mission_id, "completed")
        await _measure_and_learn(mission_id, result)
        await _remember(mission_id, result, department.contract)
        await _set_state(mission_id, "learning")
    except Exception as exc:
        log.exception("Mission %s failed while finalizing: %s", mission_id, exc)
        await _set_state(mission_id, "blocked", reason=f"Finalization failed: {exc}")


def compute_requires_approval(action_tier: str) -> bool:
    """Ch9 tiering: Read never needs approval; Draft/Execute do. Computed
    every time from the recommendation's actual action_tier, never hardcoded
    per department — so the mechanism is real even for Research, whose
    recommendations are almost always Read-tier."""
    return action_tier in ("draft", "execute")


async def _persist_observations(mission_id: uuid.UUID, result: DepartmentResult) -> list[int]:
    ids: list[int] = []
    async with AsyncSessionLocal() as db:
        for draft in result.observations:
            obs = ZamoObservation(
                mission_id=mission_id, source_type=draft.source_type,
                source_reference=draft.source_reference, extracted_evidence=draft.extracted_evidence,
                sensitivity_classification=draft.sensitivity_classification,
                relevance=draft.relevance, impact=draft.impact, urgency=draft.urgency,
                novelty=draft.novelty, persistence=draft.persistence,
            )
            db.add(obs)
            await db.flush()
            ids.append(obs.id)
        await db.commit()
    return ids


async def _persist_recommendation(
    mission_id: uuid.UUID, result: DepartmentResult, contract: DepartmentContract,
) -> ZamoRecommendation:
    observation_ids = await _persist_observations(mission_id, result)
    draft = result.recommendation
    evidence = []
    for e in draft.evidence:
        idx = e.get("observation_index")
        real_id = observation_ids[idx] if isinstance(idx, int) and 0 <= idx < len(observation_ids) else None
        evidence.append({"observation_id": real_id, "note": e.get("note")})

    requires_approval = compute_requires_approval(draft.action_tier)

    async with AsyncSessionLocal() as db:
        rec = ZamoRecommendation(
            mission_id=mission_id, summary=draft.summary, reasoning=draft.reasoning,
            action_recommended=draft.action_recommended, evidence=evidence,
            confidence=draft.confidence, alternatives_considered=draft.alternatives_considered,
            assumptions=draft.assumptions, uncertainty=draft.uncertainty,
            requires_approval=requires_approval,
        )
        db.add(rec)
        await db.commit()
        await db.refresh(rec)

    if requires_approval:
        async with AsyncSessionLocal() as db:
            db.add(ZamoApproval(
                recommendation_id=rec.id, mission_id=mission_id, status="pending",
                requested_action=draft.action_recommended, required_authority="founder",
            ))
            await db.commit()

    return rec


# Pricing for the model reasoning.py uses (claude-opus-5) — update if that changes.
# Foundation for a future AI-operating-budget feature; not built yet, just captured.
_INPUT_COST_PER_MTOK = 5.00
_OUTPUT_COST_PER_MTOK = 25.00


async def _record_usage(mission_id: uuid.UUID, result: DepartmentResult) -> None:
    if not result.input_tokens and not result.output_tokens:
        return
    cost = (
        result.input_tokens / 1_000_000 * _INPUT_COST_PER_MTOK
        + result.output_tokens / 1_000_000 * _OUTPUT_COST_PER_MTOK
    )
    async with AsyncSessionLocal() as db:
        mission = await db.get(ZamoMission, mission_id)
        if not mission:
            return
        mission.input_tokens = result.input_tokens
        mission.output_tokens = result.output_tokens
        mission.estimated_cost_usd = round(cost, 6)
        await db.commit()


async def _measure_and_learn(mission_id: uuid.UUID, result: DepartmentResult) -> None:
    async with AsyncSessionLocal() as db:
        db.add(ZamoOutcome(
            mission_id=mission_id, what_happened=result.what_happened,
            what_changed=result.what_changed, lessons=result.lessons,
        ))
        await db.commit()


async def _remember(mission_id: uuid.UUID, result: DepartmentResult, contract: DepartmentContract) -> None:
    key_to_id: dict[str, int] = {}
    async with AsyncSessionLocal() as db:
        for contrib in result.knowledge_contributions:
            obj = ZamoKnowledgeObject(
                category=contrib.category, tags=contrib.tags or None, title=contrib.title,
                content=contrib.content, source=contract.slug, mission_id=mission_id,
                confidence=contrib.confidence, lifecycle_state="captured",
            )
            db.add(obj)
            await db.flush()
            key_to_id[contrib.key] = obj.id
        await db.commit()

    async with AsyncSessionLocal() as db:
        for contrib in result.knowledge_contributions:
            if contrib.relates_to_key and contrib.relates_to_key in key_to_id:
                db.add(ZamoKnowledgeRelationship(
                    from_type="knowledge_object", from_id=str(key_to_id[contrib.key]),
                    to_type="knowledge_object", to_id=str(key_to_id[contrib.relates_to_key]),
                    relationship_type=contrib.relationship_type or "related_to",
                ))
        await db.commit()


async def reconcile_interrupted_missions() -> int:
    """Called on FastAPI startup. A mission left non-terminal with a stale (or
    missing) heartbeat means the process died mid-mission — never leave it
    silently stuck (plan refinement 2)."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_HEARTBEAT_STALE_SECONDS)
    reconciled = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ZamoMission).where(ZamoMission.state.in_(["delegated", "in_progress"]))
        )
        for mission in result.scalars().all():
            stale = mission.last_heartbeat_at is None or mission.last_heartbeat_at < cutoff
            if stale:
                mission.state = "blocked"
                mission.blocked_reason = "Interrupted by backend restart — no heartbeat since last run."
                reconciled += 1
        await db.commit()
    if reconciled:
        log.warning("Reconciled %d interrupted mission(s) into blocked state", reconciled)
    return reconciled
