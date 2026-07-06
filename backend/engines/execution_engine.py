"""
Execution Engine — handles both paper and live trade execution.

Paper mode:  all logic runs, positions are tracked in DB, no Coinbase API calls.
Live mode:   places real market buy + stop-limit sell orders on Coinbase Advanced.

Stop-loss in paper mode is monitored in the position manager loop (bot.py).
Stop-loss in live mode is a resting stop-limit order on the exchange.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from clients.coinbase import coinbase_client
from config import cfg
from database import Signal, SystemEvent, Trade
from engines.risk_engine import RiskDecision

log = logging.getLogger(__name__)


async def execute_trade(
    db:           AsyncSession,
    signal:       Signal,
    decision:     RiskDecision,
    entry_price:  float,
    product_id:   str | None = None,
) -> Trade | None:
    """
    Open a trade using the RiskDecision parameters.
    product_id: Coinbase product string (e.g. "XRP-USD"). Looked up from
                config if not passed explicitly.
    Returns the created Trade row or None on failure.
    """
    from config import COINBASE_PRODUCTS
    pid = product_id or COINBASE_PRODUCTS.get(signal.symbol)

    if cfg.is_live:
        return await _execute_live(db, signal, decision, entry_price, pid)
    return await _execute_paper(db, signal, decision, entry_price)


async def close_trade(
    db:           AsyncSession,
    trade:        Trade,
    exit_price:   float,
    reason:       str,
) -> float:
    """
    Close an open trade and return realized PnL.
    """
    pnl = (exit_price - trade.entry_price) * trade.quantity

    trade.status     = _close_status(reason)
    trade.exit_price = exit_price
    trade.pnl_usd    = round(pnl, 6)
    trade.pnl_pct    = round((pnl / trade.cost_usd * 100) if trade.cost_usd else 0.0, 4)
    trade.closed_at  = datetime.utcnow()

    if cfg.is_live and trade.coinbase_order_id:
        # Cancel the resting stop-loss order when we close manually
        await coinbase_client.cancel_order(trade.coinbase_order_id)

    await _log_event(db, "trade_close", trade.symbol,
                     f"Closed {trade.symbol} @ ${exit_price:.6f} | PnL: ${pnl:+.4f} | Reason: {reason}",
                     {"trade_id": str(trade.id), "pnl": pnl, "reason": reason})
    await db.commit()
    log.info("Trade %s closed | %s | PnL $%+.4f", trade.id, reason, pnl)
    return pnl


# ── Paper execution ───────────────────────────────────────────────────────────

async def _execute_paper(
    db:          AsyncSession,
    signal:      Signal,
    decision:    RiskDecision,
    entry_price: float,
) -> Trade:
    trade = Trade(
        bot_name="crypto",
        signal_id=signal.id,
        symbol=signal.symbol,
        mode="paper",
        side="buy",
        entry_price=entry_price,
        quantity=decision.quantity,
        cost_usd=decision.position_size_usd,
        stop_loss_price=decision.stop_loss_price,
        take_profit_price=decision.take_profit_price,
        strategy="sentiment_momentum",
        status="open",
        opened_at=datetime.utcnow(),
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)

    await _log_event(db, "trade_open", signal.symbol,
                     f"[PAPER] Opened {signal.symbol} @ ${entry_price:.6f} | "
                     f"qty={decision.quantity:.6f} | SL=${decision.stop_loss_price:.6f} | "
                     f"TP=${decision.take_profit_price:.6f}",
                     {"trade_id": str(trade.id), "mode": "paper"})
    await db.commit()

    log.info("[PAPER] Trade %s opened | %s @ $%.6f | SL $%.6f | TP $%.6f",
             trade.id, signal.symbol, entry_price,
             decision.stop_loss_price, decision.take_profit_price)
    return trade


# ── Live execution ────────────────────────────────────────────────────────────

async def _execute_live(
    db:          AsyncSession,
    signal:      Signal,
    decision:    RiskDecision,
    entry_price: float,
    product_id:  str | None = None,
) -> Trade | None:
    if not product_id:
        log.error("Live execution: no product_id for %s", signal.symbol)
        return None

    # Place market buy
    quote_size = str(round(decision.position_size_usd, 2))
    buy_result = await coinbase_client.place_market_buy(product_id, quote_size)
    if not buy_result or buy_result.get("error_response"):
        log.error("Coinbase buy order failed: %s", buy_result)
        await _log_event(db, "api_error", signal.symbol,
                         "Live buy order failed", {"response": buy_result})
        await db.commit()
        return None

    # Actual fill price from order response (approximation if not available)
    filled_price = entry_price
    try:
        filled_price = float(
            buy_result["order"]["order_configuration"]
            .get("market_market_ioc", {}).get("quote_size", entry_price)
        )
    except Exception:
        pass

    # Place stop-loss order
    sl_result = await coinbase_client.place_stop_limit_sell(
        product_id=product_id,
        base_size=str(round(decision.quantity, 8)),
        stop_price=f"{decision.stop_loss_price:.8f}",
        limit_price=f"{decision.stop_loss_price * 0.99:.8f}",  # 1% below stop to ensure fill
    )
    sl_order_id = sl_result.get("order_id") if sl_result else None

    trade = Trade(
        bot_name="crypto",
        signal_id=signal.id,
        symbol=signal.symbol,
        mode="live",
        side="buy",
        entry_price=filled_price,
        quantity=decision.quantity,
        cost_usd=decision.position_size_usd,
        stop_loss_price=decision.stop_loss_price,
        take_profit_price=decision.take_profit_price,
        strategy="sentiment_momentum",
        status="open",
        coinbase_order_id=sl_order_id,
        opened_at=datetime.utcnow(),
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)

    await _log_event(db, "trade_open", signal.symbol,
                     f"[LIVE] Opened {signal.symbol} @ ${filled_price:.6f} | "
                     f"SL order: {sl_order_id}",
                     {"trade_id": str(trade.id), "mode": "live"})
    await db.commit()

    log.info("[LIVE] Trade %s opened | %s @ $%.6f | SL order %s",
             trade.id, signal.symbol, filled_price, sl_order_id)
    return trade


# ── Helpers ───────────────────────────────────────────────────────────────────

def _close_status(reason: str) -> str:
    if "stop" in reason.lower():
        return "stopped"
    if "profit" in reason.lower() or "tp" in reason.lower():
        return "closed_profit"
    if "manual" in reason.lower() or "emergency" in reason.lower():
        return "closed_manual"
    return "closed_loss"


async def _log_event(
    db: AsyncSession, event_type: str, asset: str | None, message: str, data: dict
) -> None:
    event = SystemEvent(
        event_type=event_type,
        asset=asset,
        message=message,
        data=json.dumps(data),
    )
    db.add(event)
