"""
LunarCrush API v4 client — free developer tier.

Free tier gives ~30 req/min and basic coin metrics. We cache the full
coin list for LUNARCRUSH_CACHE_TTL seconds to stay well within limits.
If no API key is set, all methods return neutral data and the scoring
engine falls back to market-data-only mode.
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

from config import cfg, LUNARCRUSH_BASE_URL, LUNARCRUSH_CACHE_TTL, LUNARCRUSH_TOP_N

log = logging.getLogger(__name__)


class LunarCrushClient:
    def __init__(self) -> None:
        self._cache: list[dict] = []
        self._cache_ts: float = 0.0
        self._lock = asyncio.Lock()

    async def get_coins(self) -> list[dict]:
        async with self._lock:
            if time.time() - self._cache_ts < LUNARCRUSH_CACHE_TTL and self._cache:
                return self._cache
            fresh = await self._fetch_coins()
            if fresh:
                self._cache = fresh
                self._cache_ts = time.time()
            return self._cache

    async def get_coin(self, symbol: str) -> dict | None:
        coins = await self.get_coins()
        for c in coins:
            if c.get("symbol", "").upper() == symbol.upper():
                return c
        return None

    async def compute_social_momentum(self, symbol: str) -> float:
        """Returns [0,1] social momentum score; 0.5 (neutral) if key absent."""
        if not cfg.social_scoring_enabled:
            return 0.5
        coin = await self.get_coin(symbol)
        if not coin:
            return 0.5
        return self._score_coin(coin)

    async def _fetch_coins(self) -> list[dict]:
        if not cfg.social_scoring_enabled:
            return []
        headers = {"Authorization": f"Bearer {cfg.lunarcrush_api_key}"}
        params  = {"limit": LUNARCRUSH_TOP_N, "sort": "galaxy_score", "order": "desc"}
        url     = f"{LUNARCRUSH_BASE_URL}/coins/list/v1"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=headers, params=params)
                resp.raise_for_status()
                coins = resp.json().get("data", [])
                log.info("LunarCrush: fetched %d coins", len(coins))
                return coins
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                log.warning("LunarCrush: invalid API key — social scoring disabled")
            else:
                log.error("LunarCrush HTTP %s: %s", exc.response.status_code, exc)
        except Exception as exc:
            log.error("LunarCrush fetch failed: %s", exc)
        return []

    @staticmethod
    def _score_coin(coin: dict) -> float:
        """
        galaxy_score 0–100 → normalized to 0–1
        average_sentiment 1–5 → normalized to 0–1
        alt_rank 1–500 → lower is better → inverted to 0–1
        """
        galaxy    = float(coin.get("galaxy_score") or 0) / 100.0
        sentiment = (float(coin.get("average_sentiment") or 3) - 1) / 4.0
        alt_rank  = max(0.0, 1.0 - float(coin.get("alt_rank") or 500) / 500.0)
        score = (galaxy * 0.45) + (sentiment * 0.30) + (alt_rank * 0.25)
        return round(min(max(score, 0.0), 1.0), 4)


lunarcrush_client = LunarCrushClient()
