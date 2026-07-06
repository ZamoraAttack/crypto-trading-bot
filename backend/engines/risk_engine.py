"""
Risk Engine — enforces ALL capital protection rules.

This module is the last gate before any trade executes.
Every rule here is non-negotiable; none can be bypassed.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import cfg, DEFAULT_STOP_LOSS_PCT, DEFAULT_TAKE_PROFIT_RR, FEE_PCT
from database import DailyRisk, Trade

log = logging.getLogger(__name__)


@dataclass
class RiskDecision:
    approved:         bool
    reason:           str | None = None
    quantity:         float = 0.0
    position_size_usd: float = 0.0
    stop_loss_price:  float = 0.0
    take_profit_price: float = 0.0
    risk_amount_usd:  float = 0.0


async def evaluate(
    db: AsyncSession,
    asset: str,
    entry_price: float,
    current_balance: float,
) -> RiskDecision:
    """
    Run all risk checks and return a RiskDecision.
    Calculates position size based on stop-loss distance, not a fixed dollar amount.
    """

    # ── 1. Daily loss limit ───────────────────────────────────────────────────
    today = date.today()
    daily = await _get_or_create_daily(db, today, current_balance)

    if daily.trading_halted:
        return RiskDecision(False, f"Trading halted: {daily.halt_reason}")

    max_loss_usd = current_balance * (cfg.max_daily_loss_pct / 100)
    if abs(daily.realized_pnl) >= max_loss_usd and daily.realized_pnl < 0:
        reason = f"Daily loss limit hit: ${abs(daily.realized_pnl):.2f} >= ${max_loss_usd:.2f}"
        await _halt_trading(db, daily, reason)
        return RiskDecision(False, reason)

    # ── 2. Max open positions ─────────────────────────────────────────────────
    open_count = await _count_open_positions(db)
    if open_count >= cfg.max_open_positions:
        return RiskDecision(False, f"Max open positions ({cfg.max_open_positions}) reached")

    # ── 3. Already have a position in this asset ──────────────────────────────
    existing = await _has_open_position(db, asset)
    if existing:
        return RiskDecision(False, f"Already holding {asset}")

    # ── 4. Position sizing ────────────────────────────────────────────────────
    risk_pct    = cfg.risk_per_trade_pct / 100.0
    risk_usd    = current_balance * risk_pct
    stop_dist   = entry_price * DEFAULT_STOP_LOSS_PCT
    stop_price  = entry_price - stop_dist

    # Size so that if stop is hit, loss = risk_usd (plus fees)
    fee_cost    = entry_price * FEE_PCT * 2  # entry + exit fee per unit
    net_risk    = max(stop_dist - fee_cost, 0.001)
    quantity    = risk_usd / net_risk
    pos_usd     = quantity * entry_price

    # Sanity: position must not exceed 20% of balance (belt-and-suspenders)
    max_pos_usd = current_balance * 0.20
    if pos_usd > max_pos_usd:
        quantity = max_pos_usd / entry_price
        pos_usd  = max_pos_usd

    # Minimum trade size (~$1 worth)
    if pos_usd < 1.0:
        return RiskDecision(False, f"Position too small: ${pos_usd:.4f} (balance too low)")

    take_profit = entry_price + (stop_dist * DEFAULT_TAKE_PROFIT_RR)

    return RiskDecision(
        approved=True,
        quantity=round(quantity, 8),
        position_size_usd=round(pos_usd, 4),
        stop_loss_price=round(stop_price, 8),
        take_profit_price=round(take_profit, 8),
        risk_amount_usd=round(risk_usd, 4),
    )


async def record_trade_opened(db: AsyncSession, position_size_usd: float) -> None:
    today = date.today()
    daily = await _get_or_create_daily(db, today, position_size_usd)
    daily.trades_count += 1
    await db.commit()


async def record_trade_closed(db: AsyncSession, pnl: float, current_balance: float) -> None:
    today = date.today()
    daily = await _get_or_create_daily(db, today, current_balance)
    daily.realized_pnl += pnl
    daily.current_balance = current_balance
    daily.pnl_pct = (daily.realized_pnl / daily.starting_balance) * 100 if daily.starting_balance else 0

    max_loss_usd = daily.starting_balance * (cfg.max_daily_loss_pct / 100)
    if not daily.trading_halted and daily.realized_pnl < -max_loss_usd:
        reason = f"Daily loss limit hit after close: ${abs(daily.realized_pnl):.2f}"
        await _halt_trading(db, daily, reason)

    await db.commit()


async def get_daily_state(db: AsyncSession) -> dict:
    today = date.today()
    stmt  = select(DailyRisk).where(DailyRisk.date == today)
    row   = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        return {
            "date": str(today),
            "realized_pnl": 0.0,
            "pnl_pct": 0.0,
            "trades_count": 0,
            "trading_halted": False,
            "halt_reason": None,
            "current_balance": cfg.initial_balance,
        }
    return {
        "date":            str(row.date),
        "realized_pnl":    row.realized_pnl,
        "pnl_pct":         row.pnl_pct,
        "trades_count":    row.trades_count,
        "trading_halted":  row.trading_halted,
        "halt_reason":     row.halt_reason,
        "current_balance": row.current_balance,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_daily(db: AsyncSession, today: date, balance: float) -> DailyRisk:
    stmt = select(DailyRisk).where(DailyRisk.date == today)
    row  = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        row = DailyRisk(
            date=today,
            starting_balance=balance,
            current_balance=balance,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _halt_trading(db: AsyncSession, daily: DailyRisk, reason: str) -> None:
    daily.trading_halted = True
    daily.halt_reason    = reason
    log.warning("TRADING HALTED: %s", reason)
    await db.commit()


async def _count_open_positions(db: AsyncSession) -> int:
    stmt   = select(func.count()).where(Trade.status == "open")
    result = await db.execute(stmt)
    return result.scalar_one() or 0


async def _has_open_position(db: AsyncSession, asset: str) -> bool:
    stmt   = select(func.count()).where(Trade.symbol == asset, Trade.status == "open")
    result = await db.execute(stmt)
    return (result.scalar_one() or 0) > 0
