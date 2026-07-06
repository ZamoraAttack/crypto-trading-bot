"""
Control endpoints — used by the dashboard for emergency stop and mode toggle.
These are the only mutating endpoints.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import cfg
from database import DailyRisk, SystemEvent, Trade, get_session
from engines.execution_engine import close_trade
from clients.coinbase import coinbase_client

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/control", tags=["control"])


@router.post("/emergency-stop")
async def emergency_stop(db: AsyncSession = Depends(get_session)):
    """
    Immediately closes all open positions (paper: mark closed, live: market sell)
    and halts trading for the rest of the day.
    """
    stmt  = select(Trade).where(Trade.status == "open")
    trades = (await db.execute(stmt)).scalars().all()

    closed = []
    for trade in trades:
        # Get current price for the asset
        exit_price = trade.entry_price  # fallback
        if trade.mode == "live" and trade.symbol:
            from config import COINBASE_PRODUCTS
            product_id = COINBASE_PRODUCTS.get(trade.symbol)
            if product_id:
                ticker = await coinbase_client.get_ticker(product_id)
                if ticker:
                    exit_price = float(ticker.get("price") or trade.entry_price)

        await close_trade(db, trade, exit_price, "emergency stop")
        closed.append(trade.symbol)

    # Halt trading for today
    today = date.today()
    stmt2  = select(DailyRisk).where(DailyRisk.date == today)
    daily  = (await db.execute(stmt2)).scalar_one_or_none()
    if daily:
        daily.trading_halted = True
        daily.halt_reason    = "Emergency stop triggered via dashboard"
    else:
        db.add(DailyRisk(
            date=today,
            starting_balance=cfg.initial_balance,
            current_balance=cfg.initial_balance,
            trading_halted=True,
            halt_reason="Emergency stop triggered via dashboard",
        ))

    event = SystemEvent(
        event_type="system",
        message=f"Emergency stop executed. Closed: {closed}",
        data=json.dumps({"closed_assets": closed}),
    )
    db.add(event)
    await db.commit()

    log.warning("EMERGENCY STOP executed. Closed: %s", closed)
    return {"status": "stopped", "closed": closed, "count": len(closed)}


@router.post("/resume-trading")
async def resume_trading(db: AsyncSession = Depends(get_session)):
    """Clears today's trading halt. Use only after manual review."""
    today = date.today()
    stmt  = select(DailyRisk).where(DailyRisk.date == today)
    daily = (await db.execute(stmt)).scalar_one_or_none()
    if daily and daily.trading_halted:
        daily.trading_halted = False
        daily.halt_reason    = None
        await db.commit()
        log.info("Trading resumed via dashboard")
        return {"status": "resumed"}
    return {"status": "was_not_halted"}


@router.get("/status")
async def system_status(db: AsyncSession = Depends(get_session)):
    today  = date.today()
    stmt   = select(DailyRisk).where(DailyRisk.date == today)
    daily  = (await db.execute(stmt)).scalar_one_or_none()
    return {
        "trading_mode":    cfg.trading_mode,
        "trading_halted":  daily.trading_halted if daily else False,
        "halt_reason":     daily.halt_reason    if daily else None,
        "social_scoring":  cfg.social_scoring_enabled,
        "coinbase_keys":   bool(cfg.coinbase_api_key),
        "timestamp":       datetime.utcnow().isoformat(),
    }
