"""
Signal Engine — combines CoinGecko community data, Fear & Greed regime,
and Coinbase market data to produce a ranked list of candidate assets.

Social data source: CoinGecko (free, no key) + Alternative.me F&G (free, no key).
Upgradeable to LunarCrush by swapping compute_social_momentum() in this file.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from clients.coinbase import coinbase_client
from clients.coingecko import coingecko_client
from clients.fear_greed import fear_greed_client
from config import COINBASE_PRODUCTS, get_asset_tier

log = logging.getLogger(__name__)


@dataclass
class AssetSignal:
    symbol:               str
    tier:                 int
    product_id:           str | None
    social_momentum:      float   # 0–1 (CoinGecko community × F&G modifier)
    fear_greed_value:     int     # 0–100 raw index value
    price:                float
    volume_24h:           float
    price_change_24h_pct: float
    candles:              list[dict]   # OHLCV, chronological


async def scan_assets() -> list[AssetSignal]:
    """
    Fetches social + market data for all tracked assets.
    Returns a list of AssetSignal objects for the scoring engine.
    """
    # Fetch macro regime once per scan (cached 1h)
    fg_modifier = await fear_greed_client.get_regime_modifier()
    fg_index    = await fear_greed_client.get_index()
    log.info("F&G: %d (%s) → modifier %.2f",
             fg_index["value"], fg_index["label"], fg_modifier)

    all_assets = list(COINBASE_PRODUCTS.keys())
    signals: list[AssetSignal] = []

    for symbol in all_assets:
        product_id = COINBASE_PRODUCTS.get(symbol)
        tier       = get_asset_tier(symbol)

        if product_id is None:
            log.debug("Skipping %s: not listed on Coinbase", symbol)
            continue

        ticker = await coinbase_client.get_ticker(product_id)
        if not ticker:
            continue

        price = float(ticker.get("price") or 0)
        if price <= 0:
            # Fallback: midpoint of best bid/ask
            bid = float(ticker.get("best_bid") or 0)
            ask = float(ticker.get("best_ask") or 0)
            price = (bid + ask) / 2 if (bid > 0 and ask > 0) else 0

        if price <= 0:
            continue

        candles       = await coinbase_client.get_candles(product_id)
        community_raw = await coingecko_client.compute_social_momentum(symbol)

        # Coinbase ticker has no volume field — calculate from last 24 hourly candles
        if candles:
            recent = candles[-24:] if len(candles) >= 24 else candles
            volume_24h = sum(float(c.get("volume") or 0) for c in recent) * price
        else:
            volume_24h = 0.0
        change_24h = float(ticker.get("price_percent_chg_24h") or 0)
        # Apply Fear & Greed regime modifier to social score
        social_momentum = round(min(community_raw * fg_modifier, 1.0), 4)

        signals.append(AssetSignal(
            symbol=symbol,
            tier=tier,
            product_id=product_id,
            social_momentum=social_momentum,
            fear_greed_value=fg_index["value"],
            price=price,
            volume_24h=volume_24h,
            price_change_24h_pct=change_24h,
            candles=candles,
        ))

    log.info("Signal scan: %d assets collected", len(signals))
    return signals
