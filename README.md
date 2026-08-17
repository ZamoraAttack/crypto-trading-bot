# ZAMO — Zamora Advanced Machine Operations

A personal AI operating system: department-style AI agents that observe, research, and recommend against real data — Postgres-backed memory, a fixed approval gate before anything risky happens, and a Next.js dashboard to watch and direct it all. Built on top of an earlier project of mine, a live crypto trading bot, which still runs underneath it today.

This repo is both of those things at once — a working AI agent platform, and the trading infrastructure it was built on top of. Both are real and both run in production on the same VPS.

## Contents

- [What ZAMO is](#what-zamo-is)
- [Architecture](#architecture)
- [The Mission Control Loop](#the-mission-control-loop)
- [Departments](#departments)
- [Backend](#backend)
- [Frontend](#frontend)
- [Auth & security](#auth--security)
- [AI integration](#ai-integration)
- [How this gets built — AI-assisted development, honestly](#how-this-gets-built--ai-assisted-development-honestly)
- [Deployment & operations](#deployment--operations)
- [Real problems solved](#real-problems-solved)
- [The trading bot underneath](#the-trading-bot-underneath)
- [Evolution](#evolution)
- [Tech stack](#tech-stack)
- [Running it locally](#running-it-locally)
- [Project status](#project-status)

## What ZAMO is

I wanted something that could do more than show me data — something that could look at what's happening across the things I run, figure out what actually matters, and tell me what to do about it, with evidence attached. That's ZAMO: a set of AI "departments" (Research, Trading Intelligence, Customer Discovery, and Relationship Management, with more planned) that each run a fixed reasoning loop against real data, produce an evidence-backed recommendation, and — for anything beyond read-only analysis — wait for me to approve it before anything happens.

It is **not** a chatbot with a system prompt. Every department is a typed contract implementation running a real tool-use loop against the Claude API, with retry-and-validate logic for when the model's output doesn't match what the schema promised, persistent memory in Postgres so recommendations reference real prior evidence instead of starting from zero, and a permission model that treats "the AI can look at things" and "the AI can act on things" as two different, separately-gated capabilities.

It is also not a replacement for the trading bots it happens to sit next to — the Crypto Bot underneath this repo, and a separate Polymarket bot, are independent, self-directed trading systems. ZAMO's Trading Intelligence department watches the Crypto Bot's resolved trades and produces advisory research about them. It never places a trade. That separation is deliberate — one system's job is to move money, the other's job is to think, and they don't share write access to each other.

## Architecture

```
1. Visual Interface        — Next.js + three.js dashboard shell (presentation only)
2. Data / Live Monitoring  — FastAPI + Postgres: bot status, trades, revenue rollups
3. Memory                  — Postgres: decisions, goals, knowledge, relationships, outcomes
4. Communications Layer    — shared voice/text "brain" (one React Context, two surfaces)
5. Connectors              — Gmail + Google Calendar via OAuth2 (read-only reach outward)
6. Departments (Agents)    — Research, Trading Intelligence, Customer Discovery,
                              Relationship Management — each runs the Mission Control Loop
7. Automation               — planned: scheduling the above to run unattended
```

Backend and frontend are two separate deployables talking over REST: a FastAPI service (Python, async, one shared Postgres connection pool) owns all state and reasoning; a Next.js 14 (App Router) dashboard owns presentation, session auth, and its own thin API routes for the chat assistant and OAuth flows. They're deployed as two systemd services on the same VPS, fronted by one nginx reverse proxy.

## The Mission Control Loop

Every department — regardless of what it's investigating — runs the same eight-step loop. This is the actual mechanism behind "an AI agent" here, not a marketing term:

```
Observe → Understand → Prioritize → Recommend → Approval/Execution → Measure → Learn → Remember
   ↑                                                                                        │
   └────────────────────────────────────────────────────────────────────────────────────────┘
```

Worked example (Research department): a competitor launches a feature → **understood** as solving a known customer complaint → **prioritized** as relevant since the MVP lacks it → **recommend** running customer interviews, with the evidence linked → **approval** required since it proposes real work → outcome **measured** once interviews happen → **learn** whether it actually confirmed the gap → **remember** it in the knowledge base for every future mission to draw on.

The "Approval/Execution" step is a structural gate, not a UI afterthought — it's built into the loop's state machine itself. Three permission tiers apply to everything a department can do: **Read** (research, monitoring — no approval needed), **Draft** (prepared but not sent/executed), and **Execute** (financial actions, infra changes, anything irreversible — always requires a human yes, no exceptions).

## Departments

| Department | Status | What it does |
|---|---|---|
| Research | Live | General-purpose investigation — the reference implementation every other department is built against |
| Trading Intelligence | Live | Read-only advisory analysis of the Crypto Bot's resolved trades — never trades itself |
| Customer Discovery | Built, mid-integration | Investigates target customer segments and willingness-to-pay for a payroll MVP idea; explicitly defers any actual outreach to Relationship Management |
| Relationship Management | Built, mid-integration | Newest department — being finalized now |

Every department is a thin class implementing one shared contract (`intelligence/contracts.py`) and running through one shared reasoning engine (`intelligence/reasoning.py`). That's deliberate: Research was built first specifically so later departments could reuse its plumbing almost unchanged, rather than each one reinventing the tool-use loop, retry logic, and cost tracking from scratch.

## Backend

FastAPI, fully async, one router per domain (`departments.py`, `missions.py`, `approvals.py`, `knowledge.py`, `memory.py`, `pg.py`). Two database access patterns coexist by design: SQLAlchemy models for schema-managed tables (`Base.metadata.create_all()` — no migration framework, deliberately, for a single-operator system this size) and a raw `asyncpg` connection pool for hot-path reads. The `zamo_` table family splits **ephemeral mission data** (`missions`, `observations`, `recommendations`, `approvals` — scoped to one run) from a **durable knowledge graph** (`knowledge_objects`, `knowledge_relationships`, `outcomes` — outlives any single mission and is what future missions actually query against).

## Frontend

Next.js 14, App Router, TypeScript, Tailwind. Two things worth calling out because they're genuinely non-obvious App Router behavior, not generic React knowledge:

- **Layouts persist across client-side navigation.** The sidebar lives in `layout.tsx` rather than being imported per-page specifically so its collapse state survives clicking between pages — a per-page-imported sidebar would remount and lose that state on every navigation.
- **Server Components can't pass component references as props into Client Components** — only already-rendered elements or serializable data can cross that boundary. Icons get rendered server-side and passed down as elements, not as component references.

Voice and the text chat panel share one implementation (`ZamoAssistantProvider`, a React Context) rather than being two parallel features — sending a message by typing visibly triggers Voice's own "thinking" indicator, which is the actual proof they're one system, not two.

## Auth & security

A JWT-signed `auth-token` cookie gates the dashboard — `httpOnly` (unreadable from JS, blocks XSS token theft), `sameSite: lax` (CSRF mitigation). Login itself is a PIN, read from an environment variable and validated server-side with no hardcoded fallback — the route fails closed (500) if the variable isn't set, rather than silently accepting anything. Gmail and Calendar connectors use a standard OAuth2 authorization-code grant with refresh tokens stored locally, never in git.

Worth being straightforward about: a shared PIN is a fine tradeoff for a single-operator personal system behind an SSH-only VPS — it would be the wrong choice for anything with more than one real user, where it'd need real per-account authentication instead.

## AI integration

Each department's reasoning call is a manual tool-use loop against the Claude API: a system prompt, a set of typed tool schemas, and the running message history go out; the model replies with text or a `tool_use` block; the code executes it and appends a `tool_result`; the loop continues until the model calls the one "submit result" tool that ends the mission.

Two things learned the hard way, now baked into the engine permanently:

- **JSON Schema constraints aren't server-enforced.** `required` fields and `minItems` are hints to the model, not guarantees — it has submitted results missing required fields or with an empty array where the schema said "at least one." The real fix is application-level: validate the result, reject it with an explicit error explaining what's wrong, and force a genuine retry turn. Schema + prompt wording alone isn't enough for anything that must not come back empty.
- **Hosted tools like `web_search` can silently invoke a hidden `code_execution` tool.** If that gets interrupted mid-call, later turns need the response's `container` ID passed back in or the API rejects the continuation outright — a failure mode invisible until the real, deployed path gets exercised, not a local mock.

A trailing-24-hour cost cap blocks new missions once spend crosses a threshold — the same category of control as rate limiting, just for API spend instead of request volume.

## How this gets built — AI-assisted development, honestly

I use Claude Code heavily to build this, and I'd rather say that plainly than have it be a vague implication. Claude writes a large share of the actual code — routes, components, SQL, the reasoning engine's retry logic — from architecture and direction I give it.

What that leaves me responsible for, and what I actually do: decide the architecture and the typed contract every department has to implement against; decide what gets built and in what order; review real behavior, not clean exit codes — more than once a mission "succeeded" with an empty result, and the only way that surfaced was independently re-querying the database instead of trusting a clean-looking run; deploy it, operate it, and debug it when production disagrees with what worked locally. "It ran without an error" and "it worked" are different claims, and treating them as the same one is where the real mistakes in this project came from.

## Deployment & operations

Linux VPS, systemd (`Type=simple`, `Restart=always`, secrets injected via `EnvironmentFile`, never in code), nginx reverse proxying to the dashboard with a separate WebSocket route straight to FastAPI. Deploys never blind-overwrite a live file — incoming changes get diffed against what's running, backed up, then swapped. If `requirements.txt` changes, `pip install` runs in the target venv *before* the restart, not after — a `git pull` alone doesn't update an already-created virtualenv. A restart is only trusted once its PID/timestamp is actually confirmed to have changed, not just because the command exited 0.

## Real problems solved

A few of the debugging stories worth being able to walk through in detail, not just claim happened:

- **A silent JSONB decode bug.** The raw `asyncpg` pool was returning Postgres `jsonb` columns as raw text, not parsed objects — `driver doesn't decode JSONB by default`. Surfaced as `.map is not a function` on a frontend component consuming what should've been an array. Fixed with a per-connection type codec registered pool-wide, which also silently fixed the same latent bug on two other tables that just hadn't been exercised by a `.map()`-consuming component yet.
- **A missing `logging.basicConfig()` call** had silently swallowed every `log.info()` in the app since day one — only `warning`+ ever printed via Python's default handler. A mission would report "success" with an empty result and there was no way to tell why, because the absence of logs *was* the bug, not evidence nothing was happening.
- **A family of four related bugs** in the shared reasoning engine — a dangling hidden tool call on interruption, a missing container ID needed to resume a code-execution session, a retry helper that over-stripped a result it should have kept, and an unhandled `KeyError` on a missing required field — each one only became visible once the previous one was fixed. A clean run this time doesn't mean the class of problem is gone.
- **A missing production API key**, found only because a mission was triggered through the real deployed chat path for the first time, instead of run locally against production Postgres over an SSH tunnel — the convenient way to test isn't always testing the thing that actually matters.

## The trading bot underneath

ZAMO's backend and dashboard are built directly on top of an earlier project of mine — an automated cryptocurrency trading system that scores assets on social sentiment and market momentum, sizes positions with a rules-based risk engine, and exposes everything through the same dashboard ZAMO now lives in. It's still live, still trading in paper mode, and its data is exactly what ZAMO's Trading Intelligence department analyzes.

### Why it exists

Most retail trading bots are single-file scripts with no risk controls and no visibility into *why* a trade fired. This was built to solve both problems: a modular scoring pipeline that produces a deterministic, explainable score per asset, and a risk engine that sits as a hard gate in front of every order — no trade bypasses position sizing, daily loss limits, or the open-position cap.

### Signal → score → risk → execution

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

Each tracked asset gets a deterministic `final_score` (0–100):

```
raw    = social_score × 0.35 + volume_score × 0.35 + price_score × 0.30
final  = raw × 100 × tier_multiplier × fear_greed_modifier
```

Tier 1 assets (higher-conviction majors) get a +20% multiplier bonus; Tier 3 assets get a −20% penalty and must additionally clear a minimum raw-score floor before the multiplier applies, so a single strong sub-signal can't push a speculative asset through on its own. Trades only fire above a configurable score threshold (default 65/100).

The risk engine is a hard gate — every rule enforced in code, not configured as a suggestion: 1% of account risked per trade (sized from stop-loss distance), 5% max daily loss with an automatic halt for the rest of the day once hit, max 3 concurrent open positions, fixed 4% stop-loss / 2:1 reward-to-risk take-profit.

## Evolution

Roughly, in order: a paper-trading crypto bot with a scoring/risk pipeline and a bare dashboard → a full three.js visual identity and glassmorphism redesign → voice and text chat sharing one assistant "brain" → a Postgres-backed Memory layer → Gmail/Calendar connectors → the Mission Control Loop and the department framework itself → Research proven end-to-end against real output → Trading Intelligence, then Customer Discovery, then Relationship Management added on top of that same framework.

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.11, FastAPI, async SQLAlchemy, asyncpg |
| AI / agents | Anthropic Claude API — manual tool-use loop, hosted web search, structured tool schemas |
| Database | PostgreSQL |
| Dashboard | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, three.js (`@react-three/fiber`) |
| Auth | JWT-signed httpOnly session cookie, OAuth2 (Gmail/Calendar) |
| Deployment | systemd services, nginx reverse proxy, Linux VPS |
| Market/social data (trading bot) | Coinbase Advanced Trade API, CoinGecko, LunarCrush, Fear & Greed Index |

## Running it locally

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
cp .env.example .env.local   # ANTHROPIC_API_KEY, DASHBOARD_PIN, Gmail/Calendar OAuth creds
npm run dev
```

You'll need your own Postgres instance and API keys (Coinbase Advanced Trade, LunarCrush, Anthropic) — see `.env.example` for every variable the backend reads. The trading bot runs safely in **paper mode** by default; live trading requires explicitly setting `TRADING_MODE=live` plus real Coinbase credentials. `deploy/` contains the systemd unit files, nginx config, and a `setup.sh` that provisions a fresh Linux VPS end-to-end — the same script used for this project's own production deployment.

## Project status

Live in production on a single VPS: the trading bot running continuously in paper mode, ZAMO's Research and Trading Intelligence departments proven end-to-end against real output, and Customer Discovery / Relationship Management built and being finalized now.
