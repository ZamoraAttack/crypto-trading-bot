"""
Postgres writer — mirrors key events to the shared tradingdb.
All functions are fire-and-forget: they log a warning on failure but never
raise, so the bot keeps running even if Postgres is temporarily unavailable.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

import asyncpg

log = logging.getLogger("pg_writer")

_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    global _pool
    url = os.getenv("POSTGRES_URL", "")
    if not url:
        log.warning("POSTGRES_URL not set — Postgres writes disabled")
        return
    try:
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        log.info("Postgres pool ready")
    except Exception as exc:
        log.warning("Postgres unavailable — running without it: %s", exc)


async def shutdown() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ── Heartbeat ─────────────────────────────────────────────────────────────────

async def write_heartbeat(
    *,
    cycle_count: int,
    open_positions: int,
    daily_pnl: float,
    mode: str,
) -> None:
    if not _pool:
        return
    try:
        async with _pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO bot_status
                    (bot_name, status, mode, last_heartbeat, cycle_count,
                     open_positions, daily_pnl_usd, updated_at)
                VALUES ('crypto', 'running', $1, NOW(), $2, $3, $4, NOW())
                ON CONFLICT (bot_name) DO UPDATE SET
                    status         = 'running',
                    mode           = $1,
                    last_heartbeat = NOW(),
                    cycle_count    = $2,
                    open_positions = $3,
                    daily_pnl_usd  = $4,
                    updated_at     = NOW()
                """,
                mode, cycle_count, open_positions, round(daily_pnl, 4),
            )
    except Exception as exc:
        log.warning("Heartbeat write failed: %s", exc)


# ── Signals ───────────────────────────────────────────────────────────────────

async def write_signal(
    *,
    symbol: str,
    final_score: float,
    social_score: float,
    volume_score: float,
    price_score: float,
    action: str,
    rejection_reason: Optional[str] = None,
    trade_id: Optional[str] = None,
) -> Optional[int]:
    if not _pool:
        return None
    try:
        async with _pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO signals
                    (bot_name, symbol, final_score, social_score, volume_score,
                     price_score, action, rejection_reason, trade_id)
                VALUES ('crypto', $1, $2, $3, $4, $5, $6, $7, $8::uuid)
                RETURNING id
                """,
                symbol,
                round(final_score, 2),
                round(social_score, 2),
                round(volume_score, 2),
                round(price_score, 2),
                action,
                rejection_reason,
                trade_id,
            )
            return row["id"] if row else None
    except Exception as exc:
        log.warning("Signal write failed: %s", exc)
        return None


# ── Trades ────────────────────────────────────────────────────────────────────

async def write_trade(
    *,
    symbol: str,
    side: str,
    entry_price: float,
    quantity: float,
    cost_usd: float,
    mode: str,
    strategy: Optional[str] = None,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
) -> Optional[str]:
    if not _pool:
        return None
    try:
        async with _pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO trades
                    (bot_name, symbol, side, entry_price, quantity, cost_usd,
                     mode, strategy, metadata)
                VALUES ('crypto', $1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
                """,
                symbol,
                side,
                round(entry_price, 6),
                round(quantity, 6),
                round(cost_usd, 4),
                mode,
                strategy,
                json.dumps({"stop_loss": stop_loss, "take_profit": take_profit}),
            )
            return str(row["id"]) if row else None
    except Exception as exc:
        log.warning("Trade write failed: %s", exc)
        return None


async def close_trade_pg(
    *,
    pg_trade_id: str,
    exit_price: float,
    pnl_usd: float,
    cost_usd: float,
) -> None:
    if not _pool:
        return
    try:
        pnl_pct = (pnl_usd / cost_usd * 100) if cost_usd else 0.0
        async with _pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE trades
                SET exit_price = $1,
                    pnl_usd    = $2,
                    pnl_pct    = $3,
                    status     = 'closed',
                    closed_at  = NOW()
                WHERE id = $4::uuid
                """,
                round(exit_price, 6),
                round(pnl_usd, 4),
                round(pnl_pct, 4),
                pg_trade_id,
            )
    except Exception as exc:
        log.warning("Trade close failed: %s", exc)


# ── Logs ──────────────────────────────────────────────────────────────────────

async def write_log(
    *,
    level: str,
    category: str,
    message: str,
    metadata: Optional[dict] = None,
) -> None:
    if not _pool:
        return
    try:
        async with _pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO logs (bot_name, level, category, message, metadata)
                VALUES ('crypto', $1, $2, $3, $4)
                """,
                level,
                category,
                message,
                json.dumps(metadata) if metadata else None,
            )
    except Exception as exc:
        log.warning("Log write failed: %s", exc)


# ── Balances ──────────────────────────────────────────────────────────────────

async def write_balance(
    *,
    total_usd: float,
    available_usd: float,
    locked_usd: float,
) -> None:
    if not _pool:
        return
    try:
        async with _pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO balances (bot_name, total_usd, available_usd, locked_usd)
                VALUES ('crypto', $1, $2, $3)
                """,
                round(total_usd, 4),
                round(available_usd, 4),
                round(locked_usd, 4),
            )
    except Exception as exc:
        log.warning("Balance write failed: %s", exc)
