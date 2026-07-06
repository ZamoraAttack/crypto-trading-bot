"""
Scoring Engine — computes a deterministic final_score [0–100] for each asset
and ranks opportunities.

Formula:
    raw = (social × 0.35) + (volume × 0.35) + (price × 0.30)
    final = raw × 100 × tier_multiplier   (capped at 100)

Tier multipliers:  T1 +20%,  T2 neutral,  T3 −20%
Tier 3 assets additionally require raw ≥ TIER_3_MIN_RAW_SCORE before
the multiplier is applied.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from config import (
    TIER_MULTIPLIERS,
    TIER_3_MIN_RAW_SCORE,
    WEIGHT_PRICE,
    WEIGHT_SOCIAL,
    WEIGHT_VOLUME,
    cfg,
)
from engines.signal_engine import AssetSignal

log = logging.getLogger(__name__)


@dataclass
class ScoredAsset:
    signal:               AssetSignal
    social_score:         float   # 0–1
    volume_score:         float   # 0–1
    price_score:          float   # 0–1
    raw_score:            float   # 0–1
    final_score:          float   # 0–100
    rejection_reason:     str | None = None


def score_assets(signals: list[AssetSignal]) -> list[ScoredAsset]:
    scored: list[ScoredAsset] = []
    for sig in signals:
        vol_score   = _volume_score(sig)
        price_score = _price_score(sig)
        raw = (sig.social_momentum * WEIGHT_SOCIAL +
               vol_score           * WEIGHT_VOLUME +
               price_score         * WEIGHT_PRICE)

        rejection = None
        if sig.tier == 3 and raw * 100 < TIER_3_MIN_RAW_SCORE:
            rejection = f"Tier 3 raw score {raw*100:.1f} < {TIER_3_MIN_RAW_SCORE} threshold"

        multiplier  = TIER_MULTIPLIERS.get(sig.tier, 1.0)
        final       = min(raw * 100.0 * multiplier, 100.0)

        scored.append(ScoredAsset(
            signal=sig,
            social_score=round(sig.social_momentum, 4),
            volume_score=round(vol_score, 4),
            price_score=round(price_score, 4),
            raw_score=round(raw, 4),
            final_score=round(final, 2),
            rejection_reason=rejection,
        ))

    scored.sort(key=lambda x: x.final_score, reverse=True)
    return scored


# ── Sub-scorers ───────────────────────────────────────────────────────────────

def _volume_score(sig: AssetSignal) -> float:
    """
    Scores based on volume relative to a 20-candle average and direction.
    Returns 0–1.
    """
    if not sig.candles:
        return 0.3

    volumes = [float(c.get("volume") or 0) for c in sig.candles]
    if not volumes:
        return 0.3

    avg_volume = sum(volumes[:-1]) / max(len(volumes) - 1, 1) if len(volumes) > 1 else volumes[-1]
    current_volume = float(sig.candles[-1].get("volume") or 0)

    if avg_volume == 0:
        return 0.3

    ratio = current_volume / avg_volume
    # ratio > 1.5 = high volume signal → score approaches 1.0
    score = min(ratio / 2.0, 1.0)
    return round(score, 4)


def _price_score(sig: AssetSignal) -> float:
    """
    Uses RSI(14) and EMA trend direction for a 0–1 price momentum score.
    Penalizes overbought (RSI>70) and oversold (RSI<30) conditions.
    """
    if len(sig.candles) < 15:
        # Not enough data; use 24h price change as a proxy
        chg = sig.price_change_24h_pct
        if chg > 5:
            return 0.75
        if chg > 0:
            return 0.55
        return 0.3

    closes = [float(c.get("close") or sig.price) for c in sig.candles]

    rsi    = _rsi(closes, 14)
    ema_20 = _ema(closes, 20)
    current_price = closes[-1]

    # RSI zone score: sweet spot is 45–65
    if rsi < 30 or rsi > 70:
        rsi_score = 0.2
    elif 45 <= rsi <= 65:
        rsi_score = 0.9
    else:
        rsi_score = 0.6

    # Price above EMA20 = bullish trend
    trend_score = 0.8 if current_price > ema_20 else 0.3

    return round((rsi_score * 0.5) + (trend_score * 0.5), 4)


def _rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) <= period:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [d for d in deltas if d > 0]
    losses = [-d for d in deltas if d < 0]
    avg_gain = sum(gains[-period:]) / period if gains else 0.0
    avg_loss = sum(losses[-period:]) / period if losses else 0.0
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _ema(closes: list[float], period: int) -> float:
    if len(closes) < period:
        return closes[-1] if closes else 0.0
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = price * k + ema * (1 - k)
    return ema
