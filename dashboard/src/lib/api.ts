const API_BASE = "/api/backend";
const BACKEND_DIRECT = "http://127.0.0.1:8000/api";

async function fetcher<T>(path: string): Promise<T> {
  // Server components can't resolve relative URLs — go direct to FastAPI
  const base = typeof window === "undefined" ? BACKEND_DIRECT : API_BASE;
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function poster<T>(path: string, body: unknown): Promise<T> {
  // Same server/client base split as fetcher() — this is called both from
  // client components (MemoryForm) and server-side (the voice API route).
  const base = typeof window === "undefined" ? BACKEND_DIRECT : API_BASE;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health:             () => fetcher<{ status: string; mode: string }>("/health"),
  signals:            () => fetcher<Signal[]>("/signals?limit=50"),
  positions:          () => fetcher<Trade[]>("/positions"),
  trades:             () => fetcher<Trade[]>("/trades?limit=100"),
  tradeSummary:       () => fetcher<TradeSummary>("/trades/summary"),
  risk:               () => fetcher<RiskState>("/risk"),
  controlStatus:      () => fetcher<ControlStatus>("/control/status"),
  polymarketState:    () => fetcher<unknown>("/polymarket/state"),
  polymarketPositions:() => fetcher<PmPosition[]>("/polymarket/positions"),
  polymarketPositionsLive: () => fetcher<PmPositionLive[]>("/polymarket/positions/live"),
  polymarketTrades:   () => fetcher<PmTrade[]>("/polymarket/trades"),
  polymarketStats:    () => fetcher<PmStats>("/polymarket/stats"),
  polymarketEquityCurve: () => fetcher<PmEquityCurve>("/polymarket/equity-curve"),
  polymarketLogs:     (lines = 50) => fetcher<{ lines: string[] }>(`/polymarket/logs?lines=${lines}`),

  emergencyStop: () =>
    fetch(`${API_BASE}/control/emergency-stop`, { method: "POST" }).then(r => r.json()),

  resumeTrading: () =>
    fetch(`${API_BASE}/control/resume-trading`, { method: "POST" }).then(r => r.json()),

  // ── Postgres unified endpoints ──────────────────────────────────────────
  pg: {
    bots:     ()                             => fetcher<PgBotStatus[]>("/pg/bots"),
    trades:   (bot?: string, status?: string) =>
      fetcher<PgTrade[]>(`/pg/trades?limit=100${bot ? `&bot=${bot}` : ""}${status ? `&status=${status}` : ""}`),
    summary:  (bot?: string)                 =>
      fetcher<PgSummary>(`/pg/trades/summary${bot ? `?bot=${bot}` : ""}`),
    signals:  (bot?: string)                 =>
      fetcher<PgSignal[]>(`/pg/signals?limit=50${bot ? `&bot=${bot}` : ""}`),
    logs:     (bot?: string, level?: string) =>
      fetcher<PgLog[]>(`/pg/logs?limit=100${bot ? `&bot=${bot}` : ""}${level ? `&level=${level}` : ""}`),
    balances: (bot?: string)                 =>
      fetcher<PgBalance[]>(`/pg/balances${bot ? `?bot=${bot}` : ""}`),
    revenue:  (months = 6)                   =>
      fetcher<PgRevenue>(`/pg/revenue?months=${months}`),
  },

  // ── Memory Layer ─────────────────────────────────────────────────────────
  memory: {
    list: (opts: { category?: string; q?: string; limit?: number } = {}) => {
      const params = new URLSearchParams();
      if (opts.category) params.set("category", opts.category);
      if (opts.q) params.set("q", opts.q);
      if (opts.limit) params.set("limit", String(opts.limit));
      const qs = params.toString();
      return fetcher<Memory[]>(`/memory${qs ? `?${qs}` : ""}`);
    },
    create: (body: { category: string; title: string; content: string; metadata?: Record<string, unknown>; source?: string }) =>
      poster<Memory>("/memory", body),
  },
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Signal {
  id:               number;
  created_at:       string;
  symbol:           string;
  social_score:     number;
  volume_score:     number;
  price_score:      number;
  final_score:      number;
  action:           string;
  rejection_reason: string | null;
}

export interface Trade {
  id:               string;
  symbol:           string;
  mode:             string;
  side:             string;
  status:           string;
  entry_price:      number;
  exit_price:       number | null;
  quantity:         number;
  cost_usd:         number;
  stop_loss_price:  number;
  take_profit_price: number | null;
  pnl_usd:          number | null;
  opened_at:        string;
  closed_at:        string | null;
}

export interface TradeSummary {
  total_trades: number;
  wins:         number;
  losses:       number;
  win_rate_pct: number;
  total_pnl:    number;
  avg_win:      number;
  avg_loss:     number;
}

export interface RiskState {
  date:              string;
  realized_pnl:      number;
  pnl_pct:           number;
  trades_count:      number;
  trading_halted:    boolean;
  halt_reason:       string | null;
  current_balance:   number;
  trading_mode:      string;
  risk_per_trade_pct: number;
  max_daily_loss_pct: number;
  max_open_positions: number;
  social_scoring:    boolean;
  fear_greed_value:  number;
  fear_greed_label:  string;
}

export interface ControlStatus {
  trading_mode:    string;
  trading_halted:  boolean;
  halt_reason:     string | null;
  social_scoring:  boolean;
  coinbase_keys:   boolean;
  timestamp:       string;
}

// ── Postgres types ──────────────────────────────────────────────────────────

export interface PgBotStatus {
  bot_name:       string;
  status:         string;
  mode:           string;
  last_heartbeat: string;
  cycle_count:    number;
  open_positions: number;
  daily_pnl_usd:  number;
  version:        string | null;
}

export interface PgTrade {
  id:          string;
  bot_name:    string;
  symbol:      string;
  side:        string;
  entry_price: number;
  exit_price:  number | null;
  quantity:    number;
  cost_usd:    number;
  pnl_usd:     number | null;
  pnl_pct:     number | null;
  status:      string;
  mode:        string;
  strategy:    string | null;
  metadata:    Record<string, unknown> | null;
  opened_at:   string;
  closed_at:   string | null;
}

export interface PgSignal {
  id:               number;
  bot_name:         string;
  symbol:           string;
  final_score:      number;
  social_score:     number | null;
  volume_score:     number | null;
  price_score:      number | null;
  action:           string;
  rejection_reason: string | null;
  created_at:       string;
}

export interface PgLog {
  id:         number;
  bot_name:   string;
  level:      string;
  category:   string;
  message:    string;
  created_at: string;
}

export interface PgBalance {
  bot_name:      string;
  total_usd:     number;
  available_usd: number;
  locked_usd:    number;
  recorded_at:   string;
}

export interface PgRevenueMonth {
  month:          string; // "YYYY-MM"
  crypto_pnl:     number;
  polymarket_pnl: number;
  total_pnl:      number;
}

export interface PgRevenue {
  current_month: {
    crypto_pnl:          number;
    polymarket_pnl:      number;
    total_pnl:           number;
    polymarket_goal_usd: number;
    polymarket_goal_pct: number;
  };
  monthly: PgRevenueMonth[];
}

export interface Memory {
  id:         number;
  category:   string;
  title:      string;
  content:    string;
  metadata:   Record<string, unknown> | null;
  source:     string;
  created_at: string;
}

export interface PgSummary {
  total_trades: number;
  wins:         number;
  losses:       number;
  win_rate_pct: number;
  total_pnl:    number;
  avg_win:      number;
  avg_loss:     number;
  open_count:   number;
}

// ── Polymarket bot (JSON bridge) ─────────────────────────────────────────────

export interface PmPosition {
  slug:            string;
  outcome:         string;
  trader:          string;
  our_shares:      number;
  our_cost_usdc:   number;
  trader_buy_usdc: number;
  opened_at:       string;
  market_end?:     string | null;
  market_closed?:  boolean;
}

export interface PmTrade {
  id:                string;
  timestamp:         string;
  action:            string;
  followed_trader:   string;
  market:            string;
  market_title?:     string;
  outcome:           string;
  price:             number | null;
  trader_usdc:       number;
  our_usdc?:         number;
  our_shares?:       number;
  our_shares_sold?:  number;
  proceeds_usdc?:    number;
  cost_basis_usdc?:  number;
  realized_pnl:      number | null;
  status:            string;
}

export interface PmStats {
  total_pnl:      number;
  win_rate:       number;
  total_trades:   number;
  winners:        number;
  losers:         number;
  trades_24h:     number;
  last_trade:     PmTrade | null;
  recent_trades:  PmTrade[];
}

// Live wallet snapshot from `bullpen polymarket positions --output json`
export interface PmPositionLive {
  slug:           string;
  market:         string;
  outcome:        string;
  avg_price:      number;
  current_price:  number;
  current_value:  number;
  invested_usd:   number;
  shares:         number;
  unrealized_pnl: number;
  pnl_percent:    number;
  redeemable:     boolean;
  end_date?:      string;
}

export interface PmEquityCurve {
  points: { t: string; value: number }[];
  max_drawdown_usd: number;
  max_drawdown_pct: number;
}
