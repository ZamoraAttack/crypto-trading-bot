"""
Main trading loop — runs as a systemd service separate from the FastAPI server.

Cycle (every SCAN_INTERVAL seconds):
  1. Check daily risk state
  2. Scan assets (LunarCrush + Coinbase)
  3. Score and rank candidates
  4. Validate top candidates
  5. Risk engine evaluation
  6. Execute approved trades
  7. Monitor open positions (stop-loss / take-profit in paper mode)
  8. Broadcast update via WebSocket
  9. Log everything
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
from datetime import date, datetime
from pathlib import Path

import httpx

from config import cfg
from database import AsyncSessionLocal, Signal, SystemEvent, Trade, init_db
import pg_writer
import telegram_alerts
from engines.execution_engine import close_trade, execute_trade
from engines.risk_engine import (
    evaluate as risk_evaluate,
    record_trade_closed,
    record_trade_opened,
    get_daily_state,
)
from engines.scoring_engine import score_assets
from engines.signal_engine import scan_assets
from engines.validation_engine import validate
from sqlalchemy import select, func

# ── Logging ───────────────────────────────────────────────────────────────────

Path(cfg.log_path).parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(cfg.log_path),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("bot")

# ── Globals ───────────────────────────────────────────────────────────────────

_running     = True
_balance     = cfg.initial_balance   # tracked in memory; persisted via DailyRisk
_cycle_count = 0


def _shutdown(*_):
    global _running
    log.info("Shutdown signal received — stopping after current cycle")
    _running = False


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT,  _shutdown)


# ── Broadcast helper (calls FastAPI WebSocket endpoint) ──────────────────────

_API_BASE = f"http://127.0.0.1:{cfg.api_port}"


async def _broadcast(event_type: str, data: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=2) as c:
            await c.post(
                f"{_API_BASE}/internal/broadcast",
                json={"type": event_type, "data": data},
                headers={"X-API-Key": cfg.internal_api_key},
            )
    except Exception:
        pass   # dashboard is optional; never let it crash the bot


# ── Core loop ─────────────────────────────────────────────────────────────────

async def run_cycle(balance: float) -> float:
    """Run one full scan cycle. Returns updated balance."""
    async with AsyncSessionLocal() as db:

        # ── Daily risk check ─────────────────────────────────────────────────
        daily = await get_daily_state(db)
        if daily["trading_halted"]:
            log.info("Trading halted (%s). Skipping cycle.", daily["halt_reason"])
            return balance

        # ── Scan + score ─────────────────────────────────────────────────────
        raw_signals  = await scan_assets()
        scored       = score_assets(raw_signals)

        log.info("Scored %d assets. Top: %s",
                 len(scored),
                 [(s.signal.symbol, s.final_score) for s in scored[:3]])

        # Persist signal records directly to Postgres via SQLAlchemy
        for s in scored[:20]:
            sig = Signal(
                bot_name="crypto",
                symbol=s.signal.symbol,
                social_score=s.social_score,
                volume_score=s.volume_score,
                price_score=s.price_score,
                final_score=s.final_score,
                action="rejected" if s.rejection_reason else "watching",
                rejection_reason=s.rejection_reason,
            )
            db.add(sig)
        await db.commit()

        # ── Validate + execute top candidates ────────────────────────────────
        candidates = [
            s for s in scored
            if s.final_score >= cfg.signal_score_threshold and not s.rejection_reason
        ]

        for candidate in candidates[:3]:   # evaluate at most 3 per cycle
            sig_row = (await db.execute(
                select(Signal)
                .where(Signal.symbol == candidate.signal.symbol)
                .order_by(Signal.id.desc())
                .limit(1)
            )).scalar_one_or_none()

            if not sig_row:
                continue

            # Market validation
            vr = await validate(candidate)
            if not vr.passed:
                sig_row.action           = "rejected"
                sig_row.rejection_reason = vr.reason
                await db.commit()
                log.info("Rejected %s: %s", candidate.signal.symbol, vr.reason)
                continue

            # Risk engine
            decision = await risk_evaluate(db, candidate.signal.symbol,
                                           candidate.signal.price, balance)
            if not decision.approved:
                sig_row.action           = "rejected"
                sig_row.rejection_reason = decision.reason
                await db.commit()
                log.info("Risk rejected %s: %s", candidate.signal.symbol, decision.reason)
                continue

            # Execute
            sig_row.action = "approved"
            await db.commit()

            trade = await execute_trade(
                db, sig_row, decision,
                candidate.signal.price,
                candidate.signal.product_id,
            )
            if trade:
                sig_row.action   = "executed"
                sig_row.trade_id = trade.id
                await record_trade_opened(db, decision.position_size_usd)
                await db.commit()
                balance -= decision.position_size_usd
                log.info("Executed trade for %s", candidate.signal.symbol)

                await pg_writer.write_log(
                    level="INFO",
                    category="trade",
                    message=f"[{cfg.trading_mode.upper()}] Opened {candidate.signal.symbol} @ ${candidate.signal.price:.6f}",
                    metadata={"symbol": candidate.signal.symbol, "cost_usd": decision.position_size_usd,
                              "score": candidate.final_score},
                )
                telegram_alerts.alert_trade_opened(
                    "Crypto Bot", candidate.signal.symbol, "buy",
                    candidate.signal.price, decision.position_size_usd, cfg.trading_mode,
                )

        # ── Monitor open positions ────────────────────────────────────────────
        balance = await _monitor_positions(db, balance)

        # ── Heartbeat ────────────────────────────────────────────────────────
        open_count_result = await db.execute(
            select(func.count()).select_from(Trade).where(Trade.status == "open")
        )
        open_count = open_count_result.scalar_one() or 0
        await pg_writer.write_heartbeat(
            cycle_count=_cycle_count,
            open_positions=open_count,
            daily_pnl=daily.get("realized_pnl", 0.0),
            mode=cfg.trading_mode,
        )

        # ── Balance snapshot every 10 cycles (~7.5 min at 45s interval) ──────
        if _cycle_count % 10 == 0:
            await pg_writer.write_balance(
                total_usd=round(balance, 4),
                available_usd=round(balance, 4),
                locked_usd=0.0,
            )

        await _broadcast("cycle_complete", {
            "balance":      round(balance, 4),
            "top_signals":  [
                {"asset": s.signal.symbol, "score": s.final_score, "tier": s.signal.tier}
                for s in scored[:5]
            ],
        })

    return balance


async def _monitor_positions(db, balance: float) -> float:
    """
    Paper mode: check stop-loss and take-profit by comparing current price.
    Live mode: stop-loss is handled by Coinbase orders; we only check TP here.
    """
    stmt   = select(Trade).where(Trade.status == "open")
    trades = (await db.execute(stmt)).scalars().all()

    from clients.coinbase import coinbase_client
    from config import COINBASE_PRODUCTS

    for trade in trades:
        product_id = COINBASE_PRODUCTS.get(trade.symbol)
        if not product_id:
            continue

        ticker = await coinbase_client.get_ticker(product_id)
        if not ticker:
            continue

        price = float(ticker.get("price") or 0)
        if price <= 0:
            continue

        # Stop-loss
        if price <= trade.stop_loss_price:
            pnl     = await close_trade(db, trade, price, "stop loss hit")
            balance += trade.cost_usd + pnl
            await record_trade_closed(db, pnl, balance)
            log.info("Stop-loss hit: %s @ $%.6f | PnL $%+.4f", trade.symbol, price, pnl)
            await pg_writer.write_log(level="WARNING", category="trade",
                message=f"Stop-loss hit: {trade.symbol} @ ${price:.6f} | PnL ${pnl:+.4f}",
                metadata={"symbol": trade.symbol, "pnl_usd": round(pnl, 4)})
            telegram_alerts.alert_stop_loss("Crypto Bot", trade.symbol, pnl)
            continue

        # Take-profit
        if trade.take_profit_price and price >= trade.take_profit_price:
            pnl     = await close_trade(db, trade, price, "take profit hit")
            balance += trade.cost_usd + pnl
            await record_trade_closed(db, pnl, balance)
            log.info("Take-profit hit: %s @ $%.6f | PnL $%+.4f", trade.symbol, price, pnl)
            await pg_writer.write_log(level="INFO", category="trade",
                message=f"Take-profit hit: {trade.symbol} @ ${price:.6f} | PnL ${pnl:+.4f}",
                metadata={"symbol": trade.symbol, "pnl_usd": round(pnl, 4)})
            telegram_alerts.alert_trade_closed("Crypto Bot", trade.symbol, pnl, cfg.trading_mode)

    return balance


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    global _balance, _cycle_count

    await init_db()
    await pg_writer.init_pool()
    telegram_alerts.init()

    log.info("=" * 60)
    log.info("Crypto Bot starting | mode=%s | balance=$%.2f",
             cfg.trading_mode.upper(), _balance)
    log.info("Social scoring: %s", "ENABLED" if cfg.social_scoring_enabled else "DISABLED (no key)")
    log.info("=" * 60)

    await pg_writer.write_log(
        level="INFO", category="system",
        message=f"Crypto bot started | mode={cfg.trading_mode.upper()} | balance=${_balance:.2f}",
    )
    telegram_alerts.alert_startup("Crypto Bot", cfg.trading_mode)

    while _running:
        try:
            _balance = await run_cycle(_balance)
            _cycle_count += 1

        except Exception as exc:
            log.exception("Unhandled error in cycle: %s", exc)
            async with AsyncSessionLocal() as db:
                db.add(SystemEvent(
                    event_type="system",
                    message=f"Cycle error: {exc}",
                    data=json.dumps({"error": str(exc)}),
                ))
                await db.commit()
            await pg_writer.write_log(
                level="ERROR", category="system",
                message=f"Cycle error: {exc}",
                metadata={"error": str(exc)},
            )

        await asyncio.sleep(cfg.scan_interval)

    log.info("Bot stopped cleanly.")
    await pg_writer.write_log(level="INFO", category="system", message="Crypto bot stopped cleanly.")
    await pg_writer.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
