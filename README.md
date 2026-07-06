# Crypto Sentiment & Momentum Trading Bot

An automated cryptocurrency trading system that scores assets on social sentiment and market momentum, sizes positions with a rules-based risk engine, and exposes everything through a live Next.js dashboard. Built to run unattended on a VPS under systemd, with every signal, trade, and risk decision persisted to Postgres for full auditability.

## Why this exists

Most retail trading bots are single-file scripts with no risk controls and no visibility into *why* a trade fired. This project was built to solve both problems: a modular scoring pipeline that produces a deterministic, explainable score per asset, and a risk engine that sits as a hard gate in front of every order — no trade bypasses position sizing, daily loss limits, or the open-position cap.

## Architecture

```
 CoinGecko + Coinbase market data     LunarCrush social data
              │                              │
              ▼                              ▼
        ┌─────────────────────────────────────────┐
        │            Signal Engine                 │  raw market + social signals
        └─────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │           Scoring Engine                  │  final_score = weighted blend
        │  (social 35% / volume 35% / price 30%)    │  × tier multiplier × F&G modifier
        └─────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │          Validation Engine                 │  hard market filters
        └─────────────────────────────────────────┘   (liquidity, spread, price action)
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │            Risk Engine                     │  position sizing, daily loss
        │     (last gate before any order)           │  limit, max open positions
        └─────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │         Execution Engine                   │  paper or live via Coinbase
        └─────────────────────────────────────────┘   Advanced Trade API
                          │
                          ▼
                    PostgreSQL  ──────────►  FastAPI  ──────────►  Next.js Dashboard
              (trades, signals, balances)   (REST + WS)         (live positions, P&L,
                                                                  risk meter, equity curve)
```

## Tech stack

| Layer | Technology |
|---|---|
| Bot / scoring / risk engines | Python 3.11, asyncio |
| Backend API | FastAPI, SQLAlchemy (async), asyncpg |
| Database | PostgreSQL |
| Dashboard | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Recharts |
| Auth | iron-session (dashboard cookies), JWT (WebSocket) |
| Market/social data | Coinbase Advanced Trade API, CoinGecko, LunarCrush, Fear & Greed Index |
| Deployment | systemd services, nginx reverse proxy, VPS (Linux) |

## Scoring model

Each tracked asset gets a deterministic `final_score` (0–100):

```
raw    = social_score × 0.35 + volume_score × 0.35 + price_score × 0.30
final  = raw × 100 × tier_multiplier × fear_greed_modifier
```

- **Tier 1** assets (higher-conviction majors) get a +20% multiplier bonus.
- **Tier 3** assets get a −20% penalty and must additionally clear a minimum raw-score floor before the multiplier is applied — this stops a single strong sub-signal from pushing a speculative asset through.
- Trades only fire above a configurable score threshold (default 65/100).

## Risk engine

The risk engine is a hard gate — every rule is enforced in code, not just configured as a suggestion:

- 1% of account risked per trade, sized from stop-loss distance
- 5% max daily loss, with an automatic trading halt for the rest of the day once hit
- Max 3 concurrent open positions
- Fixed 4% stop-loss / 2:1 reward-to-risk take-profit

## Running it

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in your own API keys — see below
uvicorn main:app --reload

# Dashboard
cd dashboard
npm install
npm run dev
```

You'll need your own Postgres instance and API keys (Coinbase Advanced Trade, LunarCrush — free tier works) — see `.env.example` for every variable the system reads. The bot runs safely in **paper mode** by default; live trading requires explicitly setting `TRADING_MODE=live` plus real Coinbase credentials.

## Deployment

`deploy/` contains the systemd unit files, nginx config, and a `setup.sh` that provisions a fresh Linux VPS end-to-end: Python/Node install, venv, dependency install, dashboard build, and service registration — the same script used to run this project's own production deployment.

## Project status

Live in production: paper-mode trading bot running continuously on a VPS, writing every signal/trade/balance snapshot to Postgres, with the dashboard showing real-time positions, P&L, and risk exposure.
