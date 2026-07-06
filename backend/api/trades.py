from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import Trade, get_session

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("")
async def trade_history(
    limit:  int = Query(100, le=500),
    symbol: str | None = None,
    db:     AsyncSession = Depends(get_session),
):
    stmt = select(Trade).order_by(desc(Trade.opened_at)).limit(limit)
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol.upper())
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


@router.get("/summary")
async def pnl_summary(db: AsyncSession = Depends(get_session)):
    stmt = select(Trade).where(Trade.status != "open")
    rows = (await db.execute(stmt)).scalars().all()

    total_pnl = sum(r.pnl_usd or 0 for r in rows)
    wins      = [r for r in rows if (r.pnl_usd or 0) > 0]
    losses    = [r for r in rows if (r.pnl_usd or 0) <= 0]
    win_rate  = len(wins) / len(rows) * 100 if rows else 0

    return {
        "total_trades": len(rows),
        "wins":         len(wins),
        "losses":       len(losses),
        "win_rate_pct": round(win_rate, 2),
        "total_pnl":    round(total_pnl, 4),
        "avg_win":      round(sum(r.pnl_usd or 0 for r in wins) / len(wins), 4) if wins else 0,
        "avg_loss":     round(sum(r.pnl_usd or 0 for r in losses) / len(losses), 4) if losses else 0,
    }


def _serialize(t: Trade) -> dict:
    return {
        "id":               str(t.id),
        "symbol":           t.symbol,
        "mode":             t.mode,
        "side":             t.side,
        "status":           t.status,
        "entry_price":      t.entry_price,
        "exit_price":       t.exit_price,
        "quantity":         t.quantity,
        "cost_usd":         t.cost_usd,
        "stop_loss_price":  t.stop_loss_price,
        "take_profit_price": t.take_profit_price,
        "pnl_usd":          t.pnl_usd,
        "pnl_pct":          t.pnl_pct,
        "opened_at":        t.opened_at.isoformat() if t.opened_at else None,
        "closed_at":        t.closed_at.isoformat() if t.closed_at else None,
    }
