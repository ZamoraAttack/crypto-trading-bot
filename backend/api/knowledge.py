"""
Organizational Knowledge System (Ch4) — the real Knowledge Object system,
built in parallel with the legacy `memories` table (plan decision #1). The
existing chat assistant's remember/recall tools keep using `memories`
unchanged; departments write here instead.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from api.pg import get_pool, _row

router = APIRouter(prefix="/api/zamo/knowledge", tags=["zamo"])


@router.get("")
async def search_knowledge(
    category: str | None = Query(None),
    tag: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(50, le=200),
) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where: list[str] = []
    params: list[Any] = []
    if category:
        params.append(category)
        where.append(f"category = ${len(params)}")
    if tag:
        params.append(tag)
        where.append(f"tags ? ${len(params)}")
    if q:
        params.append(f"%{q}%")
        where.append(f"(title ILIKE ${len(params)} OR content ILIKE ${len(params)})")
    params.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM zamo_knowledge_objects {clause} ORDER BY created_at DESC LIMIT ${len(params)}",
            *params,
        )
    return [_row(r) for r in rows]
