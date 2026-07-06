from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from engines.risk_engine import get_daily_state
from clients.fear_greed import fear_greed_client
from config import cfg

router = APIRouter(prefix="/api/risk", tags=["risk"])


@router.get("")
async def risk_state(db: AsyncSession = Depends(get_session)):
    state  = await get_daily_state(db)
    fg     = await fear_greed_client.get_index()
    return {
        **state,
        "trading_mode":        cfg.trading_mode,
        "risk_per_trade_pct":  cfg.risk_per_trade_pct,
        "max_daily_loss_pct":  cfg.max_daily_loss_pct,
        "max_open_positions":  cfg.max_open_positions,
        "social_scoring":      True,   # always on with CoinGecko
        "fear_greed_value":    fg["value"],
        "fear_greed_label":    fg["label"],
    }
