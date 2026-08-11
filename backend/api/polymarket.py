"""
Polymarket bridge — reads the existing copytrade bot's JSON data files
and exposes them for the unified dashboard. Performance/PnL stats and the
equity curve are sourced from Postgres instead (trades.json is an
append-only log with 80k+ rows and growing; Postgres has the same data
pre-aggregated and indexed).
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import cfg
from api.pg import get_pool

log    = logging.getLogger(__name__)
router = APIRouter(prefix="/api/polymarket", tags=["polymarket"])

_DATA_DIR = Path(cfg.polymarket_data_dir) if cfg.polymarket_data_dir else None
_BULLPEN  = Path.home() / ".bullpen/bin/bullpen"


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


@router.get("/positions/live")
async def polymarket_positions_live():
    """Live wallet snapshot from the Polymarket CLOB — current odds, current
    value and unrealized P&L per open position. positions.json only has the
    entry-side data (cost basis, shares), so this is the only source for
    "what is this worth right now"."""
    if not _BULLPEN.exists():
        return []
    try:
        result = subprocess.run(
            [str(_BULLPEN), "polymarket", "positions", "--output", "json", "--non-interactive"],
            capture_output=True, text=True, timeout=20,
        )
        if result.returncode != 0:
            log.warning("bullpen positions failed: %s", result.stderr.strip())
            return []
        data = json.loads(result.stdout)
        return data if isinstance(data, list) else data.get("positions", [])
    except Exception as exc:
        log.error("Failed to fetch live positions: %s", exc)
        return []


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
    history. Downsampled for charting; drawdown is computed on the full
    series first so downsampling can't hide the real peak-to-trough."""
    pool = await get_pool()
    if not pool:
        return {"points": [], "max_drawdown_usd": 0.0, "max_drawdown_pct": 0.0}

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT total_usd, recorded_at FROM balances
            WHERE bot_name = 'polymarket'
            ORDER BY recorded_at ASC
            """
        )

    if not rows:
        return {"points": [], "max_drawdown_usd": 0.0, "max_drawdown_pct": 0.0}

    series = [(r["recorded_at"], float(r["total_usd"])) for r in rows]

    peak       = series[0][1]
    max_dd_usd = 0.0
    max_dd_pct = 0.0
    for _, val in series:
        peak   = max(peak, val)
        dd_usd = peak - val
        dd_pct = (dd_usd / peak * 100) if peak else 0.0
        if dd_usd > max_dd_usd:
            max_dd_usd, max_dd_pct = dd_usd, dd_pct

    max_points = 250
    if len(series) > max_points:
        step    = len(series) / max_points
        sampled = [series[int(i * step)] for i in range(max_points)]
        if sampled[-1] != series[-1]:
            sampled.append(series[-1])
    else:
        sampled = series

    return {
        "points": [{"t": ts.isoformat(), "value": round(val, 2)} for ts, val in sampled],
        "max_drawdown_usd": round(max_dd_usd, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
    }
