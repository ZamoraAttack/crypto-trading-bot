"""
Alternative.me Crypto Fear & Greed Index client — free, no key required.

Returns a market regime modifier used to scale social scores:
  Extreme Fear  (0–24)   → 0.75  (market panic — reduce signal confidence)
  Fear          (25–44)  → 0.90
  Neutral       (45–55)  → 1.00
  Greed         (56–75)  → 1.10  (momentum confirmation bonus)
  Extreme Greed (76–100) → 0.80  (overheated — reduce confidence)

Cached for 1 hour since the index only updates once per day.
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

log = logging.getLogger(__name__)

_URL = "https://api.alternative.me/fng/?limit=1"
_TTL = 3600  # 1 hour


class FearGreedClient:
    def __init__(self) -> None:
        self._value:    int   = 50   # default neutral
        self._label:    str   = "Neutral"
        self._cache_ts: float = 0.0
        self._lock = asyncio.Lock()

    async def get_regime_modifier(self) -> float:
        """Returns a multiplier [0.75, 1.10] based on current F&G index."""
        await self._refresh()
        return self._modifier(self._value)

    async def get_index(self) -> dict:
        await self._refresh()
        return {"value": self._value, "label": self._label}

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _refresh(self) -> None:
        async with self._lock:
            if time.time() - self._cache_ts < _TTL:
                return
            try:
                async with httpx.AsyncClient(timeout=10) as c:
                    r = await c.get(_URL)
                    r.raise_for_status()
                    data = r.json().get("data", [{}])[0]
                    self._value    = int(data.get("value", 50))
                    self._label    = str(data.get("value_classification", "Neutral"))
                    self._cache_ts = time.time()
                    log.info("Fear & Greed: %d (%s)", self._value, self._label)
            except Exception as exc:
                log.error("Fear & Greed fetch failed: %s", exc)

    @staticmethod
    def _modifier(value: int) -> float:
        if value <= 24:   return 0.75   # extreme fear
        if value <= 44:   return 0.90   # fear
        if value <= 55:   return 1.00   # neutral
        if value <= 75:   return 1.10   # greed
        return 0.80                      # extreme greed — overheated


fear_greed_client = FearGreedClient()
