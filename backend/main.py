"""
FastAPI application — serves REST API + WebSocket for the dashboard.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from api import approvals, control, departments, knowledge, memory, missions, pg, polymarket, positions, risk, signals, trades
from config import cfg
from database import init_db
from intelligence.mission_engine import reconcile_interrupted_missions
from intelligence.seed import seed_departments

# Pre-existing gap, fixed here: this file never configured the root logger,
# so every log.info()/log.debug() call was silently swallowed (only
# log.warning()+ ever printed, via Python's default "lastResort" handler) —
# invisible even though the code ran correctly. Real diagnostic visibility
# depends on this.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

log = logging.getLogger(__name__)

app = FastAPI(title="Crypto Bot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # nginx restricts to localhost in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ──────────────────────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)
_ALGORITHM = "HS256"


def create_token(username: str, expires_minutes: int = 1440) -> str:
    expire  = datetime.utcnow() + timedelta(minutes=expires_minutes)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, cfg.dashboard_jwt_secret, algorithm=_ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload  = jwt.decode(credentials.credentials, cfg.dashboard_jwt_secret, algorithms=[_ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise JWTError("no sub")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def internal_key_ok(x_api_key: str | None = None) -> bool:
    """Used by Next.js → FastAPI server-side calls."""
    from fastapi import Header
    return x_api_key == cfg.internal_api_key


# ── Login endpoint (called by Next.js backend) ────────────────────────────────

from fastapi import Body

@app.post("/api/auth/login")
async def login(username: str = Body(...), password: str = Body(...)):
    if username != cfg.dashboard_username or password != cfg.dashboard_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(username)
    return {"access_token": token, "token_type": "bearer"}


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(signals.router)
app.include_router(positions.router)
app.include_router(trades.router)
app.include_router(risk.router)
app.include_router(control.router)
app.include_router(polymarket.router)
app.include_router(pg.router)
app.include_router(memory.router)
app.include_router(departments.router)
app.include_router(missions.router)
app.include_router(approvals.router)
app.include_router(knowledge.router)


# ── WebSocket broadcast ───────────────────────────────────────────────────────

_ws_clients: set[WebSocket] = set()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str | None = None):
    # Validate token passed as query param: ws://host/ws?token=<jwt>
    if cfg.dashboard_jwt_secret:
        try:
            jwt.decode(token or "", cfg.dashboard_jwt_secret, algorithms=[_ALGORITHM])
        except JWTError:
            await ws.close(code=4001)
            return

    await ws.accept()
    _ws_clients.add(ws)
    log.info("WebSocket client connected (%d total)", len(_ws_clients))
    try:
        while True:
            await ws.receive_text()   # keep alive — client sends pings
    except WebSocketDisconnect:
        pass
    finally:
        _ws_clients.discard(ws)
        log.info("WebSocket client disconnected (%d total)", len(_ws_clients))


async def broadcast(event_type: str, data: dict) -> None:
    """Called by bot.py to push updates to all connected dashboard clients."""
    if not _ws_clients:
        return
    payload = json.dumps({"type": event_type, "data": data, "ts": datetime.utcnow().isoformat()})
    dead: set[WebSocket] = set()
    for ws in list(_ws_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    _ws_clients.difference_update(dead)


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    await init_db()
    log.info("Database initialized")
    await seed_departments()
    reconciled = await reconcile_interrupted_missions()
    log.info("ZAMO Executive OS ready (departments seeded, %d mission(s) reconciled)", reconciled)
    log.info("Trading mode: %s", cfg.trading_mode.upper())
    if not cfg.social_scoring_enabled:
        log.warning("LunarCrush key not set — social scoring disabled (neutral 0.5 used)")
    if cfg.is_live and not cfg.coinbase_api_key:
        log.error("Live mode selected but COINBASE_API_KEY is not set!")


@app.get("/api/health")
async def health():
    return {"status": "ok", "mode": cfg.trading_mode, "ts": datetime.utcnow().isoformat()}


# ── Internal broadcast (called by bot.py) ────────────────────────────────────

from fastapi import Header

@app.post("/internal/broadcast")
async def internal_broadcast(
    payload: dict,
    x_api_key: str | None = Header(default=None),
):
    if x_api_key != cfg.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")
    await broadcast(payload.get("type", "update"), payload.get("data", {}))
    return {"ok": True}
