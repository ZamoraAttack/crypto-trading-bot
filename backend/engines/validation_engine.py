"""
Validation Engine — hard market filters applied before any trade is considered.

ALL conditions must pass for a trade to proceed. A single failure
returns a rejection with a human-readable reason.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from clients.coinbase import coinbase_client
from engines.scoring_engine import ScoredAsset

log = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

MIN_VOLUME_USD_24H    = 500_000    # reject thin markets
MAX_SPREAD_PCT        = 0.008      # 0.8% max bid-ask spread
MIN_PRICE_CHANGE_PCT  = -15.0      # reject assets in free-fall
MAX_PRICE_CHANGE_PCT  = 50.0       # reject parabolic pumps
MIN_CANDLES_REQUIRED  = 10         # need enough history for indicators


@dataclass
class ValidationResult:
    passed:  bool
    reason:  str | None = None


async def validate(candidate: ScoredAsset) -> ValidationResult:
    sig = candidate.signal

    # ── 1. Coinbase listing ───────────────────────────────────────────────────
    if sig.product_id is None:
        return ValidationResult(False, f"{sig.symbol} not listed on Coinbase")

    # ── 2. Sufficient liquidity / volume ─────────────────────────────────────
    ticker = await coinbase_client.get_ticker(sig.product_id)
    if not ticker:
        return ValidationResult(False, "Could not fetch ticker data")

    bid = float(ticker.get("best_bid") or 0)
    ask = float(ticker.get("best_ask") or 0)
    # Use candle-based volume (ticker has no volume field)
    if sig.candles:
        recent = sig.candles[-24:] if len(sig.candles) >= 24 else sig.candles
        volume_24h = sum(float(c.get("volume") or 0) for c in recent) * sig.price
    else:
        volume_24h = 0.0

    if volume_24h < MIN_VOLUME_USD_24H:
        return ValidationResult(False, f"24h volume ${volume_24h:,.0f} below ${MIN_VOLUME_USD_24H:,} minimum")

    # ── 3. Spread check ───────────────────────────────────────────────────────
    if bid > 0 and ask > 0:
        spread_pct = (ask - bid) / bid
        if spread_pct > MAX_SPREAD_PCT:
            return ValidationResult(False, f"Spread {spread_pct*100:.2f}% exceeds {MAX_SPREAD_PCT*100:.1f}% limit")

    # ── 4. Price action sanity ────────────────────────────────────────────────
    chg = sig.price_change_24h_pct
    if chg < MIN_PRICE_CHANGE_PCT:
        return ValidationResult(False, f"24h price change {chg:.1f}% suggests capitulation — skip")
    if chg > MAX_PRICE_CHANGE_PCT:
        return ValidationResult(False, f"24h price change {chg:.1f}% looks parabolic — skip")

    # ── 5. Enough candle history ──────────────────────────────────────────────
    if len(sig.candles) < MIN_CANDLES_REQUIRED:
        return ValidationResult(False, f"Only {len(sig.candles)} candles available, need {MIN_CANDLES_REQUIRED}")

    # ── 6. Volume trend (current candle volume > 50% of recent avg) ──────────
    volumes = [float(c.get("volume") or 0) for c in sig.candles[-10:]]
    avg_vol = sum(volumes[:-1]) / max(len(volumes) - 1, 1)
    if avg_vol > 0 and volumes[-1] < avg_vol * 0.5:
        return ValidationResult(False, "Volume declining — no confirmation for entry")

    return ValidationResult(True)
