"""
Coinbase Advanced Trade REST client — CDP key authentication.

CDP keys use JWT signed with an EC private key (ES256).
Public market endpoints (ticker, candles) need no auth.
Order endpoints (buy, sell, cancel) require a signed JWT.

Key loading priority:
  1. COINBASE_KEY_FILE — path to the JSON file Coinbase downloaded
  2. COINBASE_API_KEY + COINBASE_API_SECRET env vars (manual paste)
"""
from __future__ import annotations

import json
import logging
import secrets
import time
from pathlib import Path
from typing import Any

import httpx
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from jose import jwt

from config import cfg, COINBASE_BASE_URL, COINBASE_CANDLE_GRANULARITY, COINBASE_CANDLE_LIMIT

log = logging.getLogger(__name__)

_TIMEOUT  = 10
_JWT_TTL  = 120   # seconds


def _load_cdp_credentials() -> tuple[str, str]:
    """
    Returns (key_name, private_key_pem).
    Loads from JSON file if COINBASE_KEY_FILE is set, otherwise from env vars.
    """
    if cfg.coinbase_key_file:
        path = Path(cfg.coinbase_key_file)
        if path.exists():
            data = json.loads(path.read_text())
            return data["name"], data["privateKey"]
        log.warning("COINBASE_KEY_FILE set but file not found: %s", path)

    return cfg.coinbase_api_key, cfg.coinbase_api_secret


def _build_jwt(method: str, path: str) -> str | None:
    """Build a CDP JWT token for a single request."""
    key_name, private_key_pem = _load_cdp_credentials()
    if not key_name or not private_key_pem:
        return None

    try:
        # Normalize PEM — env vars may use literal \n instead of newlines
        pem = private_key_pem.replace("\\n", "\n").encode()
        private_key = load_pem_private_key(pem, password=None)

        now = int(time.time())
        payload = {
            "sub": key_name,
            "iss": "cdp",
            "nbf": now,
            "exp": now + _JWT_TTL,
            "uri": f"{method.upper()} api.coinbase.com{path}",
        }
        headers = {
            "kid":   key_name,
            "nonce": secrets.token_hex(16),
            "alg":   "ES256",
        }
        return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
    except Exception as exc:
        log.error("JWT build failed: %s", exc)
        return None


class CoinbaseClient:

    # ── Market data (public, no auth) ─────────────────────────────────────────

    async def get_ticker(self, product_id: str) -> dict | None:
        url = f"{COINBASE_BASE_URL}/market/products/{product_id}/ticker"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r = await c.get(url)
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.error("Coinbase ticker %s: %s", product_id, exc)
            return None

    async def get_candles(self, product_id: str) -> list[dict]:
        url    = f"{COINBASE_BASE_URL}/market/products/{product_id}/candles"
        params = {"granularity": COINBASE_CANDLE_GRANULARITY, "limit": COINBASE_CANDLE_LIMIT}
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r = await c.get(url, params=params)
                r.raise_for_status()
                candles = r.json().get("candles", [])
                return list(reversed(candles))   # chronological order
        except Exception as exc:
            log.error("Coinbase candles %s: %s", product_id, exc)
            return []

    async def get_product(self, product_id: str) -> dict | None:
        url = f"{COINBASE_BASE_URL}/market/products/{product_id}"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r = await c.get(url)
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.error("Coinbase product %s: %s", product_id, exc)
            return None

    # ── Trading (authenticated, live mode only) ───────────────────────────────

    async def place_market_buy(self, product_id: str, quote_size: str) -> dict | None:
        body = {
            "client_order_id": f"cbot-{int(time.time()*1000)}",
            "product_id":      product_id,
            "side":            "BUY",
            "order_configuration": {
                "market_market_ioc": {"quote_size": quote_size}
            },
        }
        return await self._post("/orders", body)

    async def place_stop_limit_sell(
        self,
        product_id: str,
        base_size:  str,
        stop_price: str,
        limit_price: str,
    ) -> dict | None:
        body = {
            "client_order_id": f"cbot-sl-{int(time.time()*1000)}",
            "product_id":      product_id,
            "side":            "SELL",
            "order_configuration": {
                "stop_limit_stop_limit_gtc": {
                    "base_size":       base_size,
                    "limit_price":     limit_price,
                    "stop_price":      stop_price,
                    "stop_direction":  "STOP_DIRECTION_STOP_DOWN",
                }
            },
        }
        return await self._post("/orders", body)

    async def place_limit_sell(
        self, product_id: str, base_size: str, limit_price: str
    ) -> dict | None:
        body = {
            "client_order_id": f"cbot-tp-{int(time.time()*1000)}",
            "product_id":      product_id,
            "side":            "SELL",
            "order_configuration": {
                "limit_limit_gtc": {
                    "base_size":   base_size,
                    "limit_price": limit_price,
                    "post_only":   False,
                }
            },
        }
        return await self._post("/orders", body)

    async def cancel_order(self, order_id: str) -> bool:
        result = await self._post("/orders/batch_cancel", {"order_ids": [order_id]})
        return result is not None

    async def get_order(self, order_id: str) -> dict | None:
        return await self._get(f"/orders/historical/{order_id}")

    async def get_accounts(self) -> list[dict]:
        result = await self._get("/accounts")
        return result.get("accounts", []) if result else []

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _auth_header(self, method: str, path: str) -> dict:
        token = _build_jwt(method, f"/api/v3/brokerage{path}")
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def _get(self, path: str) -> dict | None:
        url = COINBASE_BASE_URL + path
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r = await c.get(url, headers=self._auth_header("GET", path))
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.error("Coinbase GET %s: %s", path, exc)
            return None

    async def _post(self, path: str, body: dict) -> dict | None:
        url      = COINBASE_BASE_URL + path
        body_str = json.dumps(body)
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r = await c.post(
                    url,
                    content=body_str,
                    headers=self._auth_header("POST", path),
                )
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.error("Coinbase POST %s: %s", path, exc)
            return None


coinbase_client = CoinbaseClient()
