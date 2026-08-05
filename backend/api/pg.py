"""
Postgres-backed API routes — reads from the shared tradingdb.
Serves both bots' data to the unified dashboard.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

import asyncpg
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/pg", tags=["postgres"])

_pool: asyncpg.Pool | None = None


def _encode_json(value: Any) -> str:
    # Pass already-serialized strings through unchanged (e.g. memory.py's
    # `json.dumps(metadata) if metadata else None`) — only encode raw Python
    # objects. Avoids double-encoding existing call sites that pre-dump.
    return value if isinstance(value, str) else json.dumps(value)


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Auto-decode json/jsonb columns into native Python objects on every
    connection in the pool. Without this, asyncpg returns jsonb columns as
    raw JSON text rather than parsed lists/dicts — which arrives at the
    frontend as a string instead of an array (e.g. ZamoRecommendation.evidence
    breaking .map() calls) rather than the real JSON the API response
    promises."""
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename, encoder=_encode_json, decoder=json.loads,
            schema="pg_catalog", format="text",
        )


async def get_pool() -> asyncpg.Pool | None:
    global _pool
    if _pool is None:
        url = os.getenv("POSTGRES_URL", "")
        if url:
            try:
                _pool = await asyncpg.create_pool(url, min_size=1, max_size=5, init=_init_connection)
            except Exception as exc:
                return None
    return _pool


def _row(r: asyncpg.Record) -> dict:
    out = {}
    for k, v in r.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


# ── Bot status ────────────────────────────────────────────────────────────────

@router.get("/bots")
async def get_bots() -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM bot_status ORDER BY bot_name"
        )
    return [_row(r) for r in rows]


# ── Trades ────────────────────────────────────────────────────────────────────

@router.get("/trades")
async def get_trades(
    bot:    str | None = Query(None),
    status: str | None = Query(None),
    limit:  int        = Query(50, le=500),
) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where  = []
    params: list[Any] = []
    if bot:
        params.append(bot)
        where.append(f"bot_name = ${len(params)}")
    if status:
        params.append(status)
        where.append(f"status = ${len(params)}")
    params.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM trades {clause} ORDER BY opened_at DESC LIMIT ${len(params)}",
            *params,
        )
    return [_row(r) for r in rows]


@router.get("/trades/summary")
async def get_trades_summary(bot: str | None = Query(None)) -> dict:
    pool = await get_pool()
    if not pool:
        return {}
    where  = "WHERE bot_name = $1" if bot else ""
    params = [bot] if bot else []
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            SELECT
                COUNT(*)                                         AS total_trades,
                COUNT(*) FILTER (WHERE pnl_usd > 0)             AS wins,
                COUNT(*) FILTER (WHERE pnl_usd <= 0)            AS losses,
                COALESCE(SUM(pnl_usd), 0)                       AS total_pnl,
                COALESCE(AVG(pnl_usd) FILTER (WHERE pnl_usd > 0), 0) AS avg_win,
                COALESCE(AVG(pnl_usd) FILTER (WHERE pnl_usd <= 0), 0) AS avg_loss,
                COUNT(*) FILTER (WHERE status = 'open')          AS open_count
            FROM trades {where}
            """,
            *params,
        )
    d = dict(row)
    total = d["total_trades"] or 0
    wins  = d["wins"] or 0
    d["win_rate_pct"] = round((wins / total * 100) if total else 0, 1)
    d["total_pnl"]    = round(float(d["total_pnl"] or 0), 4)
    d["avg_win"]      = round(float(d["avg_win"] or 0), 4)
    d["avg_loss"]     = round(float(d["avg_loss"] or 0), 4)
    return d


# ── Revenue ───────────────────────────────────────────────────────────────────

POLYMARKET_MONTHLY_GOAL_USD = 1000.0  # from Polymarket bot strategy notes; edit here if the goal changes


@router.get("/revenue")
async def get_revenue(months: int = Query(6, le=24)) -> dict:
    pool = await get_pool()
    if not pool:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT date_trunc('month', closed_at) AS month, bot_name, COALESCE(SUM(pnl_usd), 0) AS pnl
            FROM trades
            WHERE status = 'closed' AND closed_at IS NOT NULL
              AND closed_at >= NOW() - ($1 || ' months')::interval
            GROUP BY month, bot_name
            ORDER BY month
            """,
            str(months),
        )

    by_month: dict[str, dict[str, float]] = {}
    for r in rows:
        key = r["month"].date().isoformat()[:7]  # "YYYY-MM"
        by_month.setdefault(key, {"crypto_pnl": 0.0, "polymarket_pnl": 0.0})
        by_month[key][f"{r['bot_name']}_pnl"] = round(float(r["pnl"]), 4)

    monthly = [
        {
            "month": month,
            "crypto_pnl": vals["crypto_pnl"],
            "polymarket_pnl": vals["polymarket_pnl"],
            "total_pnl": round(vals["crypto_pnl"] + vals["polymarket_pnl"], 4),
        }
        for month, vals in sorted(by_month.items())
    ]

    current_key = datetime.now().date().isoformat()[:7]
    current = next((m for m in monthly if m["month"] == current_key), None) or {
        "crypto_pnl": 0.0, "polymarket_pnl": 0.0, "total_pnl": 0.0,
    }
    polymarket_pnl = current["polymarket_pnl"]
    goal_pct = round(max(polymarket_pnl, 0) / POLYMARKET_MONTHLY_GOAL_USD * 100, 1)

    return {
        "current_month": {
            "crypto_pnl": current["crypto_pnl"],
            "polymarket_pnl": polymarket_pnl,
            "total_pnl": current["total_pnl"],
            "polymarket_goal_usd": POLYMARKET_MONTHLY_GOAL_USD,
            "polymarket_goal_pct": goal_pct,
        },
        "monthly": monthly,
    }


# ── Signals ───────────────────────────────────────────────────────────────────

@router.get("/signals")
async def get_signals(
    bot:   str | None = Query(None),
    limit: int        = Query(50, le=200),
) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    if bot:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM signals WHERE bot_name=$1 ORDER BY created_at DESC LIMIT $2",
                bot, limit,
            )
    else:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM signals ORDER BY created_at DESC LIMIT $1", limit,
            )
    return [_row(r) for r in rows]


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs")
async def get_logs(
    bot:      str | None = Query(None),
    level:    str | None = Query(None),
    category: str | None = Query(None),
    limit:    int        = Query(100, le=500),
) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    where  = []
    params: list[Any] = []
    if bot:
        params.append(bot)
        where.append(f"bot_name = ${len(params)}")
    if level:
        params.append(level.upper())
        where.append(f"level = ${len(params)}")
    if category:
        params.append(category)
        where.append(f"category = ${len(params)}")
    params.append(limit)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT id, bot_name, level, category, message, created_at "
            f"FROM logs {clause} ORDER BY created_at DESC LIMIT ${len(params)}",
            *params,
        )
    return [_row(r) for r in rows]


# ── Balances ──────────────────────────────────────────────────────────────────

@router.get("/balances")
async def get_balances(bot: str | None = Query(None)) -> list[dict]:
    pool = await get_pool()
    if not pool:
        return []
    if bot:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM balances WHERE bot_name=$1 ORDER BY recorded_at DESC LIMIT 30",
                bot,
            )
    else:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (bot_name) *
                FROM balances
                ORDER BY bot_name, recorded_at DESC
                """
            )
    return [_row(r) for r in rows]
