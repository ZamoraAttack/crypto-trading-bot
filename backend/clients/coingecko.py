"""
CoinGecko community data client — free, no API key required.

Fetches per-coin community metrics (Reddit activity, Twitter followers)
and caches them for 15 minutes to stay well within the free-tier rate limit
(~30 req/min). Used as a drop-in replacement for LunarCrush social scoring.
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

log = logging.getLogger(__name__)

_BASE  = "https://api.coingecko.com/api/v3"
_TTL   = 1800  # 30-minute cache

# CoinGecko coin IDs for each tracked asset symbol
COINGECKO_IDS: dict[str, str] = {
    "XRP":   "ripple",
    "XLM":   "stellar",
    # XDC: removed — not on Coinbase, CoinGecko ID unconfirmed
    "QNT":   "quant-network",
    "HBAR":  "hedera-hashgraph",
    "SHX":   "stronghold-token",
    "ETH":   "ethereum",
    "SOL":   "solana",
    "MATIC": "matic-network",
    "AVAX":  "avalanche-2",
    "DOT":   "polkadot",
    "LINK":  "chainlink",
    "ADA":   "cardano",
}


class CoinGeckoClient:
    def __init__(self) -> None:
        self._cache:    dict[str, dict] = {}   # symbol → coin data
        self._cache_ts: float = 0.0
        self._lock = asyncio.Lock()

    async def compute_social_momentum(self, symbol: str) -> float:
        """Returns [0,1] community momentum score. 0.5 = neutral / no data."""
        coin_id = COINGECKO_IDS.get(symbol)
        if not coin_id:
            return 0.5
        data = await self._get_coin(symbol, coin_id)
        if not data:
            return 0.5
        return self._score(data)

    async def get_all_community_data(self) -> dict[str, dict]:
        """Refresh cache for all tracked assets if stale."""
        async with self._lock:
            if time.time() - self._cache_ts < _TTL and self._cache:
                return self._cache
            fresh = await self._fetch_all()
            if fresh:
                self._cache = fresh
                self._cache_ts = time.time()
            return self._cache

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _get_coin(self, symbol: str, coin_id: str) -> dict | None:
        await self.get_all_community_data()
        return self._cache.get(symbol)

    async def _fetch_all(self) -> dict[str, dict]:
        """Fetch community data for all assets in batches to respect rate limits."""
        result: dict[str, dict] = {}
        symbols = list(COINGECKO_IDS.items())

        for symbol, coin_id in symbols:
            data = await self._fetch_one(coin_id)
            if data:
                result[symbol] = data
            await asyncio.sleep(2.0)   # stay well under free tier rate limit

        log.info("CoinGecko: fetched community data for %d assets", len(result))
        return result

    async def _fetch_one(self, coin_id: str) -> dict | None:
        url    = f"{_BASE}/coins/{coin_id}"
        params = {
            "localization":   "false",
            "tickers":        "false",
            "market_data":    "false",
            "community_data": "true",
            "developer_data": "false",
            "sparkline":      "false",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url, params=params)
                if r.status_code == 429:
                    log.warning("CoinGecko rate limit — skipping this coin, will retry next cache refresh")
                    return None
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.error("CoinGecko fetch %s: %s", coin_id, exc)
            return None

    @staticmethod
    def _score(data: dict) -> float:
        """
        Scores community momentum from Reddit + Twitter data.

        reddit_accounts_active_48h: proxy for engaged community size
        reddit_average_posts_48h:   content velocity
        reddit_average_comments_48h: engagement depth
        twitter_followers:           reach (used as a floor/scale reference)

        All values normalized to expected ranges and combined.
        """
        cd = data.get("community_data") or {}

        active_48h    = float(cd.get("reddit_accounts_active_48h") or 0)
        posts_48h     = float(cd.get("reddit_average_posts_48h")   or 0)
        comments_48h  = float(cd.get("reddit_average_comments_48h") or 0)

        # Normalize to [0, 1] with typical crypto community ranges
        active_score   = min(active_48h   / 1500.0,  1.0)
        posts_score    = min(posts_48h    / 50.0,    1.0)
        comments_score = min(comments_48h / 200.0,   1.0)

        combined = (active_score * 0.50) + (posts_score * 0.25) + (comments_score * 0.25)

        # Dampen to avoid outliers pulling score too high; floor at 0.3
        result = max(combined, 0.3) if combined > 0 else 0.5
        return round(min(result, 1.0), 4)


coingecko_client = CoinGeckoClient()
