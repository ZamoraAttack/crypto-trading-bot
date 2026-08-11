"""
Polymarket bridge — reads the existing copytrade bot's JSON data files
and exposes them for the unified dashboard. Performance/PnL stats and the
equity curve are sourced from Postgres instead (trades.json is an
append-only log with 80k+ rows and growing; Postgres has the same data
pre-aggregated and indexed).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import cfg
from api.pg import get_pool

log    = logging.getLogger(__name__)
router = APIRouter(prefix="/api/polymarket", tags=["polymarket"])

_DATA_DIR = Path(cfg.polymarket_data_dir) if cfg.polymarket_data_dir else None
_BULLPEN  = Path.home() / ".bullpen/bin/bullpen"

# The `bullpen polymarket positions` CLI call takes 2-20s (it hits
# Polymarket's own backend, not ours) and was previously run fresh on every
# page load, directly inside the async endpoint -- blocking this process's
# single uvicorn worker for the full duration on top of the per-request
# latency. Cached for a short window so repeat navigations reuse the last
# result instead of re-paying that cost, and run in a thread so a slow call
# doesn't stall every other concurrent request to this backend.
_POSITIONS_CACHE_TTL = 20  # seconds -- within the 15-30s window requested
_positions_cache: dict = {"data": None, "ts": 0.0}
_positions_lock = asyncio.Lock()


def _read_json(filename: str) -> dict | list:
    if not _DATA_DIR:
        return {}
    path = _DATA_DIR / filename
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {}
    except Exception as exc:
        log.error("Failed to read %s: %s", path, exc)
        return {}


@router.get("/positions")
async def polymarket_positions():
    return _read_json("positions.json")


def _run_bullpen_positions() -> list:
    """Blocking; must only be called via asyncio.to_thread()."""
    result = subprocess.run(
        [str(_BULLPEN), "polymarket", "positions", "--output", "json", "--non-interactive"],
        capture_output=True, text=True, timeout=20,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    data = json.loads(result.stdout)
    return data if isinstance(data, list) else data.get("positions", [])


@router.get("/positions/live")
async def polymarket_positions_live():
    """Live wallet snapshot from the Polymarket CLOB — current odds, current
    value and unrealized P&L per open position. positions.json only has the
    entry-side data (cost basis, shares), so this is the only source for
    "what is this worth right now". Cached for _POSITIONS_CACHE_TTL seconds
    (see comment above the cache declaration)."""
    if not _BULLPEN.exists():
        return []

    now = time.monotonic()
    if _positions_cache["data"] is not None and now - _positions_cache["ts"] < _POSITIONS_CACHE_TTL:
        return _positions_cache["data"]

    async with _positions_lock:
        # Re-check: another request may have refreshed the cache while we
        # were waiting for the lock, in which case skip the CLI call entirely.
        now = time.monotonic()
        if _positions_cache["data"] is not None and now - _positions_cache["ts"] < _POSITIONS_CACHE_TTL:
            return _positions_cache["data"]

        try:
            data = await asyncio.to_thread(_run_bullpen_positions)
        except Exception as exc:
            log.error("Failed to fetch live positions: %s", exc)
            # Serve the last good snapshot rather than an empty list, which
            # the dashboard would otherwise render as "No open positions".
            return _positions_cache["data"] if _positions_cache["data"] is not None else []

        _positions_cache["data"] = data
        _positions_cache["ts"] = time.monotonic()
        return data


@router.get("/trades")
async def polymarket_trades():
    return _read_json("trades.json")


@router.get("/state")
async def polymarket_state():
    return _read_json("state.json")


@router.get("/logs")
async def polymarket_logs(lines: int = 100):
    if not _DATA_DIR:
        return {"lines": []}
    log_path = _DATA_DIR / "copybot.log"
    try:
        text  = log_path.read_text(errors="replace")
        tail  = text.strip().splitlines()[-lines:]
        return {"lines": tail}
    except FileNotFoundError:
        return {"lines": []}
    except Exception as exc:
        log.error("Failed to read polymarket log: %s", exc)
        return {"lines": [], "error": str(exc)}


_EMPTY_STATS = {
    "total_pnl": 0.0, "win_rate": 0.0, "total_trades": 0, "total_activity": 0,
    "winners": 0, "losers": 0, "trades_24h": 0,
    "last_trade": None, "recent_trades": [],
}


def _pg_trade_to_pm(r: dict) -> dict:
    meta = r.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    return {
        "id":              str(r["id"]),
        "timestamp":       r["opened_at"].isoformat(),
        "action":          r["side"].upper(),
        "followed_trader": meta.get("followed_trader", "—"),
        "market":          r["symbol"],
        "market_title":    meta.get("market_title") or meta.get("slug") or r["symbol"],
        "outcome":         meta.get("outcome", "—"),
        "price":           float(r["entry_price"]) if r["entry_price"] is not None else None,
        "trader_usdc":     0,
        "realized_pnl":    float(r["pnl_usd"]) if r["pnl_usd"] is not None else None,
        "status":          "failed" if r["status"] == "failed" else "ok",
    }


@router.get("/stats")
async def polymarket_stats():
    pool = await get_pool()
    if not pool:
        return _EMPTY_STATS

    async with pool.acquire() as conn:
        # total_trades counts only rows with a real settled pnl_usd (one per
        # resolved position) — status='closed' alone also matches buy-fill
        # rows that close_open_buys() flips to 'closed' once their position
        # resolves, which have pnl_usd=NULL and previously inflated this
        # count 3x, deflating win_rate by the same factor. total_activity
        # keeps the old COUNT(*) semantics for callers that want a raw
        # closed-row/event count (e.g. the dashboard's "Recent Activity"
        # label), not a trade-count for win-rate math.
        summary = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE pnl_usd IS NOT NULL) AS total_trades,
                COUNT(*)                                    AS total_activity,
                COUNT(*) FILTER (WHERE pnl_usd > 0)         AS winners,
                COUNT(*) FILTER (WHERE pnl_usd <= 0)        AS losers,
                COALESCE(SUM(pnl_usd), 0)                   AS total_pnl
            FROM trades
            WHERE bot_name = 'polymarket' AND status = 'closed'
            """
        )
        trades_24h = await conn.fetchval(
            """
            SELECT COUNT(*) FROM trades
            WHERE bot_name = 'polymarket' AND opened_at >= NOW() - INTERVAL '24 hours'
            """
        )
        recent_rows = await conn.fetch(
            """
            SELECT * FROM trades WHERE bot_name = 'polymarket'
            ORDER BY opened_at DESC LIMIT 20
            """
        )

    total     = summary["total_trades"] or 0
    activity  = summary["total_activity"] or 0
    winners   = summary["winners"] or 0
    losers    = summary["losers"] or 0
    recent_trades = [_pg_trade_to_pm(dict(r)) for r in recent_rows]

    return {
        "total_pnl":      round(float(summary["total_pnl"] or 0), 4),
        "win_rate":       round((winners / total * 100) if total else 0, 1),
        "total_trades":   total,
        "total_activity": activity,
        "winners":        winners,
        "losers":         losers,
        "trades_24h":     trades_24h or 0,
        "last_trade":     recent_trades[0] if recent_trades else None,
        "recent_trades":  recent_trades,
    }


@router.get("/equity-curve")
async def polymarket_equity_curve():
    """Account value over time + max drawdown, from the balances snapshot
    history. write_balance() inserts a row every bot cycle with no retention
    cap (39k+ rows for this bot alone as of Aug 2026, growing forever) --
    both the drawdown calculation and the chart's point sampling are done in
    SQL via window functions so this endpoint's own memory/transfer cost
    stays bounded (~250 rows) no matter how large the table grows, instead
    of pulling the whole table into Python on every request. The drawdown
    query still has to scan every row (unavoidable for a correct all-time
    peak-to-trough), but that was already fast (~100ms server-side per
    EXPLAIN ANALYZE against the pre-fix version) -- the fix is to stop
    shipping the full result set across the wire and looping over it here."""
    pool = await get_pool()
    if not pool:
        return {"points": [], "max_drawdown_usd": 0.0, "max_drawdown_pct": 0.0}

    async with pool.acquire() as conn:
        # Pairs each row's dollar drawdown with *that same row's* percentage
        # drawdown (not the independently-largest percentage, which can come
        # from a different row) -- matches the original Python loop's
        # `if dd_usd > max_dd_usd: max_dd_usd, max_dd_pct = dd_usd, dd_pct`.
        drawdown = await conn.fetchrow(
            """
            WITH running AS (
                SELECT total_usd,
                       MAX(total_usd) OVER (ORDER BY recorded_at ASC) AS peak
                FROM balances
                WHERE bot_name = 'polymarket'
            ),
            dd AS (
                SELECT
                    (peak - total_usd) AS dd_usd,
                    CASE WHEN peak > 0 THEN (peak - total_usd) / peak * 100 ELSE 0 END AS dd_pct
                FROM running
            )
            SELECT dd_usd AS max_dd_usd, dd_pct AS max_dd_pct
            FROM dd
            ORDER BY dd_usd DESC
            LIMIT 1
            """
        )
        points = await conn.fetch(
            """
            WITH numbered AS (
                SELECT total_usd, recorded_at,
                       ROW_NUMBER() OVER (ORDER BY recorded_at ASC) AS rn,
                       COUNT(*)    OVER ()                          AS n
                FROM balances
                WHERE bot_name = 'polymarket'
            )
            SELECT total_usd, recorded_at
            FROM numbered
            WHERE rn = 1 OR rn = n OR rn % GREATEST(1, n / 250) = 0
            ORDER BY recorded_at ASC
            """
        )

    if not points:
        return {"points": [], "max_drawdown_usd": 0.0, "max_drawdown_pct": 0.0}

    return {
        "points": [
            {"t": r["recorded_at"].isoformat(), "value": round(float(r["total_usd"]), 2)}
            for r in points
        ],
        "max_drawdown_usd": round(float(drawdown["max_dd_usd"]), 2) if drawdown else 0.0,
        "max_drawdown_pct": round(float(drawdown["max_dd_pct"]), 2) if drawdown else 0.0,
    }
