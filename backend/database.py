from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, Float, Integer,
    String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import cfg


engine = create_async_engine(cfg.database_url, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


class Base(DeclarativeBase):
    pass


class Signal(Base):
    __tablename__ = "signals"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    bot_name         = Column(String(50), nullable=False, default="crypto")
    symbol           = Column(String(100), nullable=False, index=True)
    final_score      = Column(Float, nullable=True)
    social_score     = Column(Float, nullable=True)
    volume_score     = Column(Float, nullable=True)
    price_score      = Column(Float, nullable=True)
    action           = Column(String(20), nullable=False, default="watching")
    rejection_reason = Column(String(200), nullable=True)
    trade_id         = Column(UUID(as_uuid=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Trade(Base):
    __tablename__ = "trades"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bot_name          = Column(String(50), nullable=False, default="crypto")
    symbol            = Column(String(100), nullable=False, index=True)
    mode              = Column(String(10), nullable=False, default="paper")
    side              = Column(String(10), nullable=False, default="buy")
    entry_price       = Column(Float, nullable=False)
    exit_price        = Column(Float, nullable=True)
    quantity          = Column(Float, nullable=False)
    cost_usd          = Column(Float, nullable=False)
    pnl_usd           = Column(Float, nullable=True)
    pnl_pct           = Column(Float, nullable=True)
    status            = Column(String(20), nullable=False, default="open")
    strategy          = Column(String(100), nullable=True)
    extra             = Column("metadata", JSONB, nullable=True)
    opened_at         = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at         = Column(DateTime(timezone=True), nullable=True)
    # Bot-specific fields (added to Postgres via ALTER TABLE)
    signal_id         = Column(BigInteger, nullable=True)
    stop_loss_price   = Column(Float, nullable=True)
    take_profit_price = Column(Float, nullable=True)
    coinbase_order_id = Column(String(64), nullable=True)


class DailyRisk(Base):
    __tablename__ = "daily_risk"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    date             = Column(Date, unique=True, nullable=False, index=True)
    starting_balance = Column(Float, nullable=False)
    current_balance  = Column(Float, nullable=False)
    realized_pnl     = Column(Float, nullable=False, default=0.0)
    pnl_pct          = Column(Float, nullable=False, default=0.0)
    trades_count     = Column(Integer, nullable=False, default=0)
    trading_halted   = Column(Boolean, nullable=False, default=False)
    halt_reason      = Column(Text, nullable=True)


class SystemEvent(Base):
    __tablename__ = "system_events"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    event_type  = Column(String(32), nullable=False, index=True)
    asset       = Column(String(16), nullable=True)
    message     = Column(Text, nullable=False)
    data        = Column(Text, nullable=True)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
