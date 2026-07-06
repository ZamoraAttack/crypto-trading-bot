from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Trade, get_session

router = APIRouter(prefix="/api/positions", tags=["positions"])


@router.get("")
async def open_positions(db: AsyncSession = Depends(get_session)):
    stmt = select(Trade).where(Trade.status == "open")
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


def _serialize(t: Trade) -> dict:
    return {
        "id":               str(t.id),
        "symbol":           t.symbol,
        "mode":             t.mode,
        "entry_price":      t.entry_price,
        "quantity":         t.quantity,
        "cost_usd":         t.cost_usd,
        "stop_loss_price":  t.stop_loss_price,
        "take_profit_price": t.take_profit_price,
        "opened_at":        t.opened_at.isoformat() if t.opened_at else None,
        "status":           t.status,
    }
