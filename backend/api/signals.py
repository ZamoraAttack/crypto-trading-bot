from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import Signal, get_session

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("")
async def list_signals(
    limit:  int = Query(50, le=200),
    action: str | None = None,
    db:     AsyncSession = Depends(get_session),
):
    stmt = select(Signal).order_by(desc(Signal.created_at)).limit(limit)
    if action:
        stmt = stmt.where(Signal.action == action)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


@router.get("/latest")
async def latest_signals(db: AsyncSession = Depends(get_session)):
    stmt = select(Signal).order_by(desc(Signal.created_at)).limit(10)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize(r) for r in rows]


def _serialize(s: Signal) -> dict:
    return {
        "id":               s.id,
        "created_at":       s.created_at.isoformat() if s.created_at else None,
        "symbol":           s.symbol,
        "social_score":     s.social_score,
        "volume_score":     s.volume_score,
        "price_score":      s.price_score,
        "final_score":      s.final_score,
        "action":           s.action,
        "rejection_reason": s.rejection_reason,
    }
