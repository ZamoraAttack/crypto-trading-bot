"""
Telegram alerter — shared by both bots.
All functions are fire-and-forget: never raises, logs on failure.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import urllib.request
import urllib.parse
import json

log = logging.getLogger("telegram")

_TOKEN   = ""
_CHAT_ID = ""


def init() -> None:
    global _TOKEN, _CHAT_ID
    _TOKEN   = os.getenv("TELEGRAM_TOKEN", "")
    _CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    if _TOKEN and _CHAT_ID:
        log.info("Telegram alerts enabled")
    else:
        log.warning("Telegram not configured — alerts disabled")


def send(message: str) -> None:
    if not _TOKEN or not _CHAT_ID:
        return
    try:
        url  = f"https://api.telegram.org/bot{_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id":    _CHAT_ID,
            "text":       message,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()
    except Exception as exc:
        log.warning("Telegram send failed: %s", exc)


# ── Convenience helpers ───────────────────────────────────────────────────────

def alert_startup(bot_name: str, mode: str) -> None:
    send(f"🟢 <b>{bot_name}</b> started | mode: {mode.upper()}")


def alert_stopped(bot_name: str) -> None:
    send(f"🔴 <b>{bot_name}</b> stopped")


def alert_heartbeat_missed(bot_name: str, minutes: int) -> None:
    send(f"🚨 <b>HEARTBEAT MISSED</b>\n{bot_name} has been silent for {minutes} min")


def alert_trade_opened(bot_name: str, symbol: str, side: str,
                        price: float, cost_usd: float, mode: str) -> None:
    emoji = "📈" if side.lower() == "buy" else "📉"
    send(
        f"{emoji} <b>[{mode.upper()}] Trade Opened</b>\n"
        f"Bot: {bot_name}\n"
        f"Market: {symbol}\n"
        f"Side: {side.upper()} @ ${price:.4f}\n"
        f"Cost: ${cost_usd:.2f}"
    )


def alert_trade_closed(bot_name: str, symbol: str, pnl_usd: float, mode: str) -> None:
    emoji = "✅" if pnl_usd >= 0 else "🛑"
    sign  = "+" if pnl_usd >= 0 else ""
    send(
        f"{emoji} <b>[{mode.upper()}] Trade Closed</b>\n"
        f"Bot: {bot_name}\n"
        f"Market: {symbol}\n"
        f"PnL: {sign}${pnl_usd:.2f}"
    )


def alert_stop_loss(bot_name: str, symbol: str, pnl_usd: float) -> None:
    send(
        f"🛑 <b>Stop-Loss Hit</b>\n"
        f"Bot: {bot_name}\n"
        f"Market: {symbol}\n"
        f"Loss: ${pnl_usd:.2f}"
    )


def alert_daily_limit(bot_name: str, loss_usd: float) -> None:
    send(
        f"🚨 <b>DAILY LOSS LIMIT HIT — TRADING HALTED</b>\n"
        f"Bot: {bot_name}\n"
        f"Loss today: ${loss_usd:.2f}"
    )


def alert_api_down(bot_name: str, api_name: str, error: str) -> None:
    send(
        f"⚠️ <b>API Degraded</b>\n"
        f"Bot: {bot_name}\n"
        f"API: {api_name}\n"
        f"Error: {error[:100]}"
    )


def alert_error(bot_name: str, message: str) -> None:
    send(f"❌ <b>Error — {bot_name}</b>\n{message[:200]}")
