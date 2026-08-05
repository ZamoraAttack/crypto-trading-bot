"""
Approval Queue (Ch7) — the governed boundary between recommendations and
authorized execution. Approval and execution are separate events (plan
refinement 4): deciding an approval never itself performs an action.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, HTTPException

from api.pg import get_pool, _row

router = APIRouter(prefix="/api/zamo/approvals", tags=["zamo"])

_VALID_DECISIONS = {"approved", "rejected", "cancelled"}


@router.get("")
async def list_approvals(status: str | None = None) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where = "WHERE status = $1" if status else ""
    params = [status] if status else []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM zamo_approvals {where} ORDER BY created_at DESC", *params
        )
    return [_row(r) for r in rows]


@router.post("/{approval_id}/decide")
async def decide_approval(
    approval_id: int,
    decision: str = Body(...),
    decided_by: str = Body("founder"),
    decision_note: str | None = Body(None),
) -> dict:
    if decision not in _VALID_DECISIONS:
        raise HTTPException(status_code=400, detail=f"decision must be one of {sorted(_VALID_DECISIONS)}")
    pool = await get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status FROM zamo_approvals WHERE id = $1", approval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Approval not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Approval already {row['status']}")
        updated = await conn.fetchrow(
            """
            UPDATE zamo_approvals
            SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5
            WHERE id = $1
            RETURNING *
            """,
            approval_id, decision, decided_by, datetime.now(timezone.utc), decision_note,
        )
    return _row(updated)
