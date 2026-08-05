"""
Department Overview (Ch7) — derived status only (plan refinement 5).
ZamoDepartment stores identity; mission counts/activity are computed here
from ZamoMission at read time, which remains the single source of truth.
"""
from __future__ import annotations

from fastapi import APIRouter

from api.pg import get_pool, _row

router = APIRouter(prefix="/api/zamo/departments", tags=["zamo"])


@router.get("")
async def list_departments() -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                d.slug, d.name, d.status,
                COUNT(m.id) FILTER (
                    WHERE m.state NOT IN ('completed', 'learning', 'archived')
                ) AS active_mission_count,
                MAX(m.updated_at) AS last_activity_at
            FROM zamo_departments d
            LEFT JOIN zamo_missions m ON m.department_slug = d.slug
            GROUP BY d.slug, d.name, d.status
            ORDER BY d.slug
            """
        )
    return [_row(r) for r in rows]
