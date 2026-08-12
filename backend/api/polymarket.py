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
from api.pg import get_pool, _row

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


def _classify_position(p: dict) -> str:
    """Bullpen's wallet position snapshot never clears a position once it
    resolves to a total loss -- there's no on-chain "redeem $0" transaction
    to trigger cleanup, so losing positions linger in the raw list forever
    with current_price stuck at 0 and resolution_status "unknown", even
    though Polymarket's own upstream state (upstream_redeemable) confirms
    the market resolved. Verified 2026-08-11: of 32 raw entries, 30 were
    exactly this -- stale losses already correctly recorded in our own
    `trades` table (see Pass 1 P&L integrity audit) -- and only 1 was a
    genuinely still-open market. Classified explicitly (not just filtered)
    because "claimable" (a resolved win not yet redeemed on-chain) is a
    real, distinct state from both "open" and a stale "resolved" loss --
    kept separate here so a future "Claimable" metric doesn't need to
    re-derive this."""
    if p.get("redeemable") is True:
        return "claimable"
    if p.get("resolution_status") == "open":
        return "open"
    return "resolved"


def _run_bullpen_positions() -> list:
    """Blocking; must only be called via asyncio.to_thread()."""
    result = subprocess.run(
        [str(_BULLPEN), "polymarket", "positions", "--output", "json", "--non-interactive"],
        capture_output=True, text=True, timeout=20,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    data = json.loads(result.stdout)
    positions = data if isinstance(data, list) else data.get("positions", [])
    # "Open Positions" should mean genuinely open, actionable positions --
    # not stale resolved entries Bullpen never cleared. See _classify_position.
    return [p for p in positions if _classify_position(p) == "open"]


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
    shipping the full result set across the wire and looping over it here.

    Rows in [2026-06-23, 2026-07-15 00:29 UTC] are excluded: this is the
    documented 22-day Bullpen auth outage window, extended slightly past its
    known 2026-07-14 end to also cover its recovery tail. Confirmed
    2026-08-12 this isn't just the 5,976 rows that sit at an exact,
    sustained $0.0000 (2026-06-28 to 2026-07-15 00:19:52) -- a bare
    `total_usd > 0` filter still let one transitional artifact through
    (a $2.0253 reading at 00:24:22, 81 min after the last $0.0000 row, then
    jumping to a real $73.89 just 6 min later -- too fast to be genuine
    trading at this bot's $5-10/trade sizing) and still reported a
    near-identical ~99.5% drawdown. A plain low-balance threshold isn't
    used instead because it would also cut real post-outage lows (e.g. a
    genuine $5.00 total on 2026-07-19/20, confirmed via bot.py's own
    "Portfolio: $9.01 (cash $4.01 + deployed $5.00)" log line, still
    printing every cycle as of 2026-08-12 -- the bot is alive and its
    capital has just genuinely eroded, not a display bug).

    IMPORTANT: excluding this window does NOT make the drawdown look
    "fixed" -- confirmed 2026-08-12 the real max drawdown is still ~98.8%
    ($410.71 of the $415.71 peak) even after removing the fake outage
    window. That decline is real (verified against the bot's own live
    portfolio log and on-chain `bullpen polymarket preflight` balance,
    both matching the DB). This endpoint only removes the one fabricated
    reading; it does not and should not paper over a genuine loss."""
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
                  AND recorded_at NOT BETWEEN '2026-06-23 00:00:00+00' AND '2026-07-15 00:29:00+00'
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
                  AND recorded_at NOT BETWEEN '2026-06-23 00:00:00+00' AND '2026-07-15 00:29:00+00'
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


@router.get("/outcomes/recent")
async def polymarket_recent_outcomes(limit: int = 20) -> list[dict]:
    """Recently *resolved* logical positions for the dashboard's "Recent
    Outcomes" table -- one row per settled position (side in redeem/loss,
    each with its own accurate pnl_usd per the Pass 1 audit), not the raw
    execution ledger. /pg/trades (shared with other pages) returns buy-fill
    rows mixed with settle rows, which is correct for a full audit trail but
    wrong here: a closed buy-fill row has pnl_usd=NULL, and rendering that
    as ">= 0" reads as a false WIN -- confirmed live on 2026-08-12, 61 of
    the most recent 100 raw rows were exactly this. Ordered/limited here
    server-side (not filtered client-side from an already-limited window)
    so the count stays correct regardless of how many buy fills happened
    recently."""
    pool = await get_pool()
    if not pool:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM trades
            WHERE bot_name = 'polymarket' AND side IN ('redeem', 'loss')
            ORDER BY opened_at DESC
            LIMIT $1
            """,
            limit,
        )
    return [_row(r) for r in rows]


@router.get("/trading-intelligence/latest")
async def polymarket_trading_intelligence_latest():
    """Most recent Trading Intelligence digest (backend/intelligence/,
    department slug 'trading_intelligence') for the page's Trading
    Intelligence section. Read-only summary -- never creates or influences
    a mission, matching that department's read-tier-only contract.

    Coverage (resolved_count / unique_intent_count) is computed live in SQL
    below, deliberately not by importing intelligence/trading_data.py's
    fetch_trade_observations() -- the intelligence package isn't deployed
    to this backend's environment (confirmed during the Pass 1 audit;
    deploying the whole Phase 4B backend is a separate decision this pass
    doesn't make). This query reimplements the same per-fill-dedup logic
    that fix validated (group buy rows by slug|outcome|trader, keep only
    groups with a matching settle row) directly in SQL, so the numbers stay
    live and accurate without that cross-package dependency. It reads from
    the same Postgres database either way, so the result is identical to
    what fetch_trade_observations() would return.
    """
    pool = await get_pool()
    if not pool:
        return None

    async with pool.acquire() as conn:
        mission = await conn.fetchrow(
            """
            SELECT id, title, state, updated_at, constraints
            FROM zamo_missions
            WHERE department_slug = 'trading_intelligence'
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        if not mission:
            return None

        recommendation = await conn.fetchrow(
            """
            SELECT summary, confidence, requires_approval
            FROM zamo_recommendations
            WHERE mission_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            mission["id"],
        )
        knowledge_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM zamo_knowledge_objects k
            JOIN zamo_missions m ON m.id = k.mission_id
            WHERE m.department_slug = 'trading_intelligence'
            """
        )
        # A concise executive headline for this mission, preferring the
        # 'decision' knowledge object (the digest's own curated conclusion,
        # e.g. "Decision: keep GoalLineGhost under passive observation...")
        # over the long-form recommendation.summary paragraph -- 'operational'
        # objects are just the mandatory coverage record, never a finding.
        headline_row = await conn.fetchrow(
            """
            SELECT title FROM zamo_knowledge_objects
            WHERE mission_id = $1 AND category != 'operational'
            ORDER BY (category = 'decision') DESC, created_at
            LIMIT 1
            """,
            mission["id"],
        )

        # jsonb columns are auto-decoded to dict/list where the pool has
        # the set_type_codec fix (see database.py's Phase 4B notes) but
        # arrive as a raw JSON string on any connection without it -- same
        # dual-format handling _pg_trade_to_pm() already applies to `metadata`.
        constraints = mission["constraints"] or {}
        if isinstance(constraints, str):
            try:
                constraints = json.loads(constraints)
            except Exception:
                constraints = {}
        wallet = constraints.get("wallet_scope")
        resolved_count, unique_intent_count = 0, 0
        if wallet:
            coverage = await conn.fetchrow(
                """
                WITH fills AS (
                    SELECT metadata->>'slug' AS slug, metadata->>'outcome' AS outcome,
                           metadata->>'followed_trader' AS trader, COUNT(*) AS fill_count
                    FROM trades
                    WHERE bot_name = 'polymarket' AND side = 'buy'
                      AND metadata->>'followed_trader' = $1
                    GROUP BY 1, 2, 3
                ),
                resolved_fills AS (
                    SELECT f.fill_count
                    FROM fills f
                    WHERE EXISTS (
                        SELECT 1 FROM trades s
                        WHERE s.bot_name = 'polymarket' AND s.side IN ('redeem', 'loss')
                          AND s.metadata->>'slug' = f.slug
                          AND s.metadata->>'outcome' = f.outcome
                          AND s.metadata->>'followed_trader' = f.trader
                    )
                )
                SELECT COUNT(*) AS unique_intent_count, COALESCE(SUM(fill_count), 0) AS resolved_count
                FROM resolved_fills
                """,
                wallet,
            )
            unique_intent_count = int(coverage["unique_intent_count"] or 0)
            resolved_count = int(coverage["resolved_count"] or 0)

    summary = recommendation["summary"] if recommendation else None
    if headline_row:
        headline = headline_row["title"]
    elif summary:
        # Fallback for a mission with no non-operational knowledge object
        # yet (shouldn't happen once a digest has run, but the recommendation
        # exists a beat before its knowledge_contributions are written) --
        # first sentence only, never the full paragraph.
        headline = summary.split(". ")[0].rstrip(".") + "."
    else:
        headline = None

    return {
        "mission_id":          str(mission["id"]),
        "title":               mission["title"],
        "state":               mission["state"],
        "updated_at":          mission["updated_at"].isoformat(),
        "headline":            headline,
        "summary":             summary,
        "confidence":          float(recommendation["confidence"]) if recommendation and recommendation["confidence"] is not None else None,
        "requires_approval":   recommendation["requires_approval"] if recommendation else None,
        "resolved_count":      resolved_count,
        "unique_intent_count": unique_intent_count,
        "knowledge_count":     knowledge_count or 0,
        "wallet":              wallet,
    }
