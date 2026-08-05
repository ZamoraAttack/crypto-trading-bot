"""
Mission Command (Ch5/Ch7) — create missions (persist, then trigger the
Mission Control Loop via BackgroundTasks — temporary execution infra, see
intelligence/mission_engine.py) and inspect full mission state.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException

from api.pg import get_pool, _row
from intelligence.departments import list_department_slugs
from intelligence.mission_engine import create_mission, run_mission

router = APIRouter(prefix="/api/zamo/missions", tags=["zamo"])


@router.post("")
async def post_mission(
    background_tasks: BackgroundTasks,
    title: str = Body(...),
    objective: str = Body(...),
    department_slug: str = Body(...),
    success_criteria: str | None = Body(None),
    evidence_justification: str | None = Body(None),
    constraints: dict | None = Body(None),
    authority_granted: str = Body("read"),
    created_by: str = Body("founder"),
) -> dict:
    if department_slug not in list_department_slugs():
        raise HTTPException(status_code=400, detail=f"Department '{department_slug}' is not implemented yet.")
    mission = await create_mission(
        title=title, objective=objective, department_slug=department_slug,
        success_criteria=success_criteria, evidence_justification=evidence_justification,
        constraints=constraints, authority_granted=authority_granted, created_by=created_by,
    )
    background_tasks.add_task(run_mission, mission.id)
    return {"id": str(mission.id), "state": mission.state}


@router.get("")
async def list_missions(department: str | None = None, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where = "WHERE department_slug = $1" if department else ""
    params: list = [department] if department else []
    params.append(limit)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM zamo_missions {where} ORDER BY created_at DESC LIMIT ${len(params)}",
            *params,
        )
    return [_row(r) for r in rows]


@router.get("/{mission_id}")
async def get_mission(mission_id: str) -> dict:
    pool = await get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        mid = uuid.UUID(mission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid mission id")
    async with pool.acquire() as conn:
        mission = await conn.fetchrow("SELECT * FROM zamo_missions WHERE id = $1", mid)
        if not mission:
            raise HTTPException(status_code=404, detail="Mission not found")
        observations = await conn.fetch(
            "SELECT * FROM zamo_observations WHERE mission_id = $1 ORDER BY created_at", mid
        )
        recommendations = await conn.fetch(
            "SELECT * FROM zamo_recommendations WHERE mission_id = $1 ORDER BY created_at", mid
        )
        approvals = await conn.fetch(
            "SELECT * FROM zamo_approvals WHERE mission_id = $1 ORDER BY created_at", mid
        )
        outcome = await conn.fetchrow("SELECT * FROM zamo_outcomes WHERE mission_id = $1", mid)
    return {
        "mission": _row(mission),
        "observations": [_row(r) for r in observations],
        "recommendations": [_row(r) for r in recommendations],
        "approvals": [_row(r) for r in approvals],
        "outcome": _row(outcome) if outcome else None,
    }
