"""
Memory Layer — persistent decisions, goals, knowledge, relationships, and history.
Reads/writes the shared tradingdb `memories` table via the same pool `pg.py` uses.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body, Query

from api.pg import get_pool, _row

router = APIRouter(prefix="/api/memory", tags=["memory"])

VALID_CATEGORIES = {
    "decision", "goal", "business_knowledge", "relationship",
    "conversation", "experiment", "outcome", "agent_history",
}


@router.post("")
async def create_memory(
    category: str          = Body(...),
    title:    str           = Body(...),
    content:  str           = Body(...),
    metadata: dict | None    = Body(None),
    source:   str            = Body("manual"),
) -> dict:
    pool = await get_pool()
    if not pool:
        return {}
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO memories (category, title, content, metadata, source)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            category, title, content,
            json.dumps(metadata) if metadata else None,
            source,
        )
    return _row(row)


@router.get("")
async def list_memories(
    category: str | None = Query(None),
    q:        str | None = Query(None),
    limit:    int         = Query(50, le=200),
) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where: list[str] = []
    params: list[Any] = []
    if category:
        params.append(category)
        where.append(f"category = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        where.append(f"(title ILIKE ${len(params)} OR content ILIKE ${len(params)})")
    params.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM memories {clause} ORDER BY created_at DESC LIMIT ${len(params)}",
            *params,
        )
    return [_row(r) for r in rows]
