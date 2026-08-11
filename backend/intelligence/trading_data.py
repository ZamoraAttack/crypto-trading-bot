"""
Trading Intelligence — Tier 1 observation layer (Ch3, read-only).

Reads directly from the `trades` table the Polymarket bot already writes
(pg_writer.py) — no separate ingestion pipeline, no new table, no Claude
calls. An "observation" here is a merged view of one position's buy row and
(if resolved) its settle row, correlated the same way the bot's own
close_open_buys() already does: (slug, outcome, followed_trader) read from
each row's `metadata` jsonb column. This module never opens a session that
stays alive across a Claude call — callers must fully consume the result
before doing any reasoning.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select

from database import AsyncSessionLocal, Trade

# 2026-06-17 is when reconcile_settled_positions() started computing
# realized_pnl from each market's own resolved price (not the live wallet
# snapshot, which drops positions almost immediately after they resolve) —
# the fix that made settle-row outcome data (pnl_usd, win/loss, resolution
# timing) trustworthy. The later 2026-08-03 backfill is a narrower concern:
# it only touched buy-row status/closed_at bookkeeping (fixing rows stuck
# "open" forever), fields this module doesn't read — it does not affect
# settle-row pnl/outcome truth, so it isn't the right cutoff for this data.
RELIABLE_DATA_CUTOFF = datetime(2026, 6, 17, tzinfo=timezone.utc)


@dataclass
class TradeObservation:
    correlation_key: str            # "{slug}|{outcome}|{trader}"
    slug: str
    outcome: str
    trader: str
    market_title: str
    entry_price: float
    entry_time: datetime
    position_size_usd: float
    status: str                     # "open" | "resolved"
    resolution: str | None = None   # "win" | "loss" | None
    pnl_usd: float | None = None
    pnl_pct: float | None = None
    resolved_time: datetime | None = None
    data_confidence: str = "verified"   # "verified" | "approximate"
    fill_count: int = 1                 # number of buy rows merged into this position


async def fetch_trade_observations(
    *, wallet: str | None = None, resolved_only: bool = True,
    since: datetime | None = None, limit: int = 15,
) -> list[TradeObservation]:
    """Merged, newest-resolved-first list of Polymarket positions.

    since defaults to RELIABLE_DATA_CUTOFF — callers that want to include
    approximate historical data must pass an explicit earlier `since`.
    """
    since = since or RELIABLE_DATA_CUTOFF

    async with AsyncSessionLocal() as db:
        buys_q = select(Trade).where(
            Trade.bot_name == "polymarket", Trade.side == "buy", Trade.opened_at >= since,
        )
        settles_q = select(Trade).where(
            Trade.bot_name == "polymarket", Trade.side.in_(("redeem", "loss")), Trade.opened_at >= since,
        )
        if wallet:
            buys_q = buys_q.where(Trade.extra["followed_trader"].astext == wallet)
            settles_q = settles_q.where(Trade.extra["followed_trader"].astext == wallet)

        buys = (await db.execute(buys_q)).scalars().all()
        settles = (await db.execute(settles_q)).scalars().all()

    settle_by_key: dict[str, Trade] = {}
    for s in settles:
        meta = s.extra or {}
        key = f"{meta.get('slug')}|{meta.get('outcome')}|{meta.get('followed_trader')}"
        settle_by_key[key] = s

    # A position can be built from several partial-fill buy rows sharing the
    # same (slug, outcome, trader) key (bot.py's handle_buy() appends a new
    # 'buy' row to Postgres per fill even though it merges shares/cost onto
    # one in-memory position). Group fills into one entry per key *before*
    # pairing with a settle row, or a multi-fill position would otherwise
    # surface as N duplicate observations each carrying the full position's
    # pnl_usd — confirmed happening for real (e.g. 9 fills on
    # fifwc-che-bih-2026-06-18-che) before this fix.
    fills_by_key: dict[str, list[Trade]] = {}
    for b in buys:
        meta = b.extra or {}
        key = f"{meta.get('slug', '')}|{meta.get('outcome', '')}|{meta.get('followed_trader', '')}"
        fills_by_key.setdefault(key, []).append(b)

    observations: list[TradeObservation] = []
    for key, fills in fills_by_key.items():
        slug, outcome, trader = key.split("|", 2)
        settle = settle_by_key.get(key)

        if resolved_only and settle is None:
            continue

        meta = fills[0].extra or {}
        total_cost = sum(f.cost_usd for f in fills)
        total_qty  = sum(f.quantity for f in fills)
        earliest   = min(fills, key=lambda f: f.opened_at)

        obs = TradeObservation(
            correlation_key=key, slug=slug, outcome=outcome, trader=trader,
            market_title=meta.get("market_title", ""),
            entry_price=(total_cost / total_qty) if total_qty else earliest.entry_price,
            entry_time=earliest.opened_at,
            position_size_usd=total_cost,
            status="resolved" if settle else "open",
            data_confidence="verified" if earliest.opened_at >= RELIABLE_DATA_CUTOFF else "approximate",
            fill_count=len(fills),
        )
        if settle is not None:
            obs.resolution = "win" if settle.side == "redeem" else "loss"
            obs.pnl_usd = settle.pnl_usd
            obs.pnl_pct = settle.pnl_pct
            obs.resolved_time = settle.opened_at

        observations.append(obs)

    observations.sort(key=lambda o: o.resolved_time or o.entry_time, reverse=True)
    return observations[:limit]


async def top_wallet_by_resolved_volume(*, since: datetime | None = None) -> str | None:
    """Pick the followed trader with the most resolved trades in-window —
    used to default a digest's wallet scope when the founder doesn't specify
    one. Not meant for large volumes; fine at this pilot's scale."""
    observations = await fetch_trade_observations(resolved_only=True, since=since, limit=10_000)
    if not observations:
        return None
    counts: dict[str, int] = {}
    for o in observations:
        counts[o.trader] = counts.get(o.trader, 0) + 1
    return max(counts, key=counts.get)
