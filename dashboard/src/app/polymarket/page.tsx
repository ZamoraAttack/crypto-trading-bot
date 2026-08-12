import { Suspense } from "react";
import Link from "next/link";
import { Diamond, Eye, ShieldCheck, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { PgTrade, PgBotStatus, PmPositionLive, PmEquityCurve, PmStats, PmTradingIntelligence } from "@/lib/api";
import EquityCurveChart from "@/components/EquityCurveChart";
import clsx from "clsx";

export const revalidate = 30;

type HealthState = "ok" | "warning" | "danger";

export default async function PolymarketPage() {
  // revalidate: 30 matches this route's own `export const revalidate = 30`
  // above. Without it on every fetch here, a single no-store call is enough
  // to force the whole route dynamic and defeat that setting -- every
  // navigation would re-run this full fetch from scratch, including the
  // ~3s bullpen CLI round trip on a cold cache (see api/polymarket.py's
  // positions/live cache). These endpoints are opt-in per call (see
  // FetchOpts in api.ts) specifically so this doesn't change freshness for
  // any other page that shares the same underlying wrapper functions.
  const cache30 = { revalidate: 30 };
  const [bots, recentOutcomes, pmStats, livePositions, balances, equity] = await Promise.all([
    api.pg.bots(cache30).catch(() => [] as PgBotStatus[]),
    api.polymarketOutcomesRecent(20, cache30).catch(() => [] as PgTrade[]),
    api.polymarketStats(cache30).catch(() => null as PmStats | null),
    api.polymarketPositionsLive(cache30).catch(() => [] as PmPositionLive[]),
    api.pg.balances("polymarket", cache30).catch(() => []),
    api.polymarketEquityCurve(cache30).catch(() => null as PmEquityCurve | null),
  ]);

  const bot     = bots.find(b => b.bot_name === "polymarket");
  const balance = balances[0]; // most recent snapshot
  const totalUsd     = Number(balance?.total_usd ?? 0);
  const availableUsd = Number(balance?.available_usd ?? 0);
  const lockedUsd     = Number(balance?.locked_usd ?? 0);
  const cashAllocationPct  = totalUsd ? (availableUsd / totalUsd) * 100 : 0;
  const capitalDeployedPct = totalUsd ? (lockedUsd / totalUsd) * 100 : 0;

  // positions/live is already filtered server-side to genuinely open
  // positions only (api/polymarket.py's _classify_position) -- Bullpen's
  // wallet snapshot never clears a position once it resolves to a total
  // loss, so the raw feed used to list dozens of stale, long-resolved
  // positions as if they were live markets. See the Pass 3 data-quality
  // check before this redesign.
  const totalExposure   = livePositions.reduce((s, p) => s + Number(p.current_value ?? 0), 0);
  const largestPosition = livePositions.reduce((m, p) => Math.max(m, Number(p.current_value ?? 0)), 0);
  const largestPositionPct = totalUsd ? (largestPosition / totalUsd) * 100 : 0;

  const dbHealthy = bots.length > 0 || balances.length > 0;

  // The old 90s "stale" threshold assumed a ~30s cycle interval. Measured
  // against real balance-snapshot timestamps on 2026-08-12, this bot's
  // actual cadence is 400-760s (likely backoff from repeated buy failures
  // -- see below), so 90s made a perfectly healthy, cycling bot always read
  // "stale". Widened to a generous multiple of the observed range instead
  // of eliminating the check (a genuinely crashed process should still
  // trip it). Separately, MIN_TRADE_SIZE_USD detects the specific case
  // live in the bot's own log right now: "Insufficient collateral" on a
  // $5 buy attempt, wallet holding $0.0079 -- a healthy, running bot that
  // simply can't trade, not a broken one. Surfaced as its own state rather
  // than folded into "Healthy"/"Stale" so it isn't misread either way.
  const HEARTBEAT_STALE_THRESHOLD_S = 1200;
  const MIN_TRADE_SIZE_USD = 5;
  const heartbeatFresh = !!bot && bot.status === "running" &&
    (Date.now() - new Date(bot.last_heartbeat).getTime()) / 1000 < HEARTBEAT_STALE_THRESHOLD_S;
  const awaitingFunding = heartbeatFresh && availableUsd < MIN_TRADE_SIZE_USD;
  const botHealth: HealthState = !heartbeatFresh ? "danger" : awaitingFunding ? "warning" : "ok";
  const botHealthDetail = !heartbeatFresh ? "Stale" : awaitingFunding ? "Awaiting Funding" : "Healthy";

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-white">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-tile flex items-center justify-center shrink-0">
              <Diamond className="w-5 h-5 text-accent-2" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Polymarket</h1>
                {bot && <StatusDot state={botHealth} title={botHealthDetail} />}
              </div>
              <p className="text-muted text-sm">Copy-trade bot · Trading Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DataTrustBadge />
            <ObservationModeBadge />
          </div>
        </div>

        {bot ? (
          <>
            {/* Portfolio */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Portfolio</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi label="Account Balance" value={`$${totalUsd.toFixed(2)}`} />
                <Kpi label="Available Cash" value={`$${availableUsd.toFixed(2)}`} sub={`${cashAllocationPct.toFixed(0)}% of balance`} />
                <Kpi label="Capital Deployed" value={`$${lockedUsd.toFixed(2)}`} sub={`${capitalDeployedPct.toFixed(0)}% of balance`} />
                <Kpi label="Open Positions" value={String(livePositions.length)} />
              </div>
            </section>

            {/* Performance */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi
                  label="Win Rate"
                  value={`${(pmStats?.win_rate ?? 0).toFixed(1)}%`}
                  color={(pmStats?.win_rate ?? 0) >= 50 ? "text-success" : "text-danger"}
                />
                <PnlKpi label="Total P&L" value={pmStats?.total_pnl ?? 0} />
                <PnlKpi label="Today's P&L" value={Number(bot.daily_pnl_usd ?? 0)} />
                <Kpi
                  label="Max Drawdown"
                  value={`$${(equity?.max_drawdown_usd ?? 0).toFixed(2)}`}
                  sub={`${(equity?.max_drawdown_pct ?? 0).toFixed(1)}% from peak`}
                />
              </div>
            </section>

            {/* Equity curve -- height reduced from the original page's ~260px to
                keep it from dominating the first viewport, per the redesign brief */}
            <div className="glass-panel p-5">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-2">Equity Curve</h3>
              <EquityCurveChart points={equity?.points ?? []} height={160} />
            </div>

            {/* Trading Intelligence -- its own async component + Suspense boundary
                so a slow/unavailable digest never blocks the rest of the page from
                rendering (the page's own data above stays on the fast, cached path
                established in Pass 2). */}
            <Suspense fallback={<TradingIntelligenceSkeleton />}>
              <TradingIntelligenceSection />
            </Suspense>

            {/* Open Positions + Recent Outcomes -- the "live now" and "resolved
                recently" halves of the same operational story. Stacked full-width
                rather than forced into equal columns: with only a handful of open
                positions, a side-by-side 50/50 split left a large empty left column
                next to a much taller Recent Outcomes table. Full width also gives
                both wide, multi-column tables more room before truncating. */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">
                  Open Positions ({livePositions.length})
                </h3>
                {livePositions.length > 0 && (
                  <span className="text-[11px] text-muted">
                    Exposure ${totalExposure.toFixed(2)} · Largest {largestPositionPct.toFixed(0)}%
                  </span>
                )}
              </div>
              {livePositions.length > 0 ? (
                <PositionsLiveTable positions={livePositions} />
              ) : (
                <div className="glass-panel p-4">
                  <p className="text-muted text-sm">No open positions.</p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Recent Outcomes</h3>
              {recentOutcomes.length > 0 ? (
                <ActivityTable trades={recentOutcomes} />
              ) : (
                <div className="glass-panel p-4">
                  <p className="text-muted text-sm">No resolved positions yet.</p>
                </div>
              )}
            </section>

            {/* System Health -- de-emphasized relative to performance/intelligence
                above, and stripped of two fragile metrics the old page had:
                "Bot Uptime" (assumed a hardcoded 30s cycle interval) and "Last
                Cycle Runtime" (regex-parsed out of raw log text). Neither had an
                honest source available without further backend work, so both were
                dropped rather than kept looking authoritative. */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">System Health</h3>
              <div className="glass-panel p-4">
                <div className="flex flex-wrap gap-x-8 gap-y-2">
                  <HealthItem label="Bot Status" state={botHealth} detail={botHealthDetail} />
                  <HealthItem label="Data Connection" state={dbHealthy ? "ok" : "danger"} detail={dbHealthy ? "Connected" : "Disconnected"} />
                  <HealthItem label="Last Sync" state="ok" detail={timeAgo(bot.last_heartbeat)} />
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="glass-panel p-6">
            <p className="text-muted text-sm text-center">Polymarket bot has not sent a heartbeat yet.</p>
          </div>
        )}

      </main>
    </div>
  );
}

// ── Trading Intelligence ──────────────────────────────────────────────────

async function TradingIntelligenceSection() {
  // revalidate: 300 (5 min), longer than the page's own 30s -- digests run
  // periodically (not every cycle), so this avoids re-querying Postgres +
  // re-running the coverage computation on every single page navigation
  // for data that realistically doesn't change that often.
  const ti = await api.polymarketTradingIntelligence({ revalidate: 300 })
    .catch(() => null as PmTradingIntelligence | null);

  if (!ti) {
    return (
      <div className="glass-panel p-5">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-2">
          Trading Intelligence
        </h3>
        <p className="text-muted text-sm">No digest has run for this bot yet.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel glass-panel-chamfer p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">
          Latest Trading Intelligence
        </h3>
        {ti.confidence != null && (
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-accent-2/15 text-accent-2 border border-accent-2/20">
            {Math.round(ti.confidence * 100)}% confidence
          </span>
        )}
      </div>

      {/* Concise executive headline (the digest's own curated finding title,
          e.g. a 'decision' knowledge object) rather than the full recommendation
          paragraph -- the longer reasoning stays on the linked mission page. */}
      {ti.headline && (
        <p className="text-white text-sm font-medium leading-relaxed">{ti.headline}</p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted pt-1">
        <span>
          Coverage:{" "}
          <span className="text-white font-medium tabnum">{ti.resolved_count}</span> resolved positions /{" "}
          <span className="text-white font-medium tabnum">{ti.unique_intent_count}</span> unique intents
        </span>
        <span>
          Knowledge retained: <span className="text-white font-medium tabnum">{ti.knowledge_count}</span>
        </span>
      </div>

      <Link
        href={`/missions/${ti.mission_id}`}
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline pt-1"
      >
        View Intelligence Mission <ArrowRight className="w-3 h-3" strokeWidth={2} />
      </Link>
    </div>
  );
}

function TradingIntelligenceSkeleton() {
  return (
    <div className="glass-panel p-5 space-y-3">
      <div className="h-3 w-44 bg-white/10 rounded animate-pulse" />
      <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
      <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
      <div className="h-3 w-56 bg-white/5 rounded animate-pulse" />
    </div>
  );
}

// ── Observation Mode / Data Trust ────────────────────────────────────────
// Both static: Trading Intelligence's decision_authority is hardcoded to
// "read" in its department contract (backend/intelligence/departments/
// trading_intelligence.py) -- this reflects that real, current value, not
// a fabricated label. It's meant to give this UI a pattern to evolve later
// (Advisory / Limited Authority), not to build those modes now.

function ObservationModeBadge() {
  return (
    <div className="group relative">
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded-full bg-white/[0.06] text-muted border border-white/10">
        <Eye className="w-3 h-3" strokeWidth={1.75} />
        Observation Mode
      </span>
      <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg glass-panel text-xs text-muted opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10">
        Trading Intelligence watches, analyzes, learns, and remembers — but does not influence trades.
      </div>
    </div>
  );
}

function DataTrustBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-success">
      <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
      Live · Verified
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Layout primitives ────────────────────────────────────────────────────

function Kpi({ label, value, sub, color = "text-white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="relative glass-panel glass-panel-hover p-4 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={clsx("text-xl md:text-2xl font-bold mt-1.5 tabnum", color)}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function PnlKpi({ label, value }: { label: string; value: number }) {
  const pos = value >= 0;
  return (
    <div className="relative glass-panel glass-panel-hover p-4 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={clsx("text-xl md:text-2xl font-bold mt-1.5 tabnum", pos ? "text-success" : "text-danger")}>
        {pos ? "+" : "−"}${Math.abs(value).toFixed(2)}
      </p>
    </div>
  );
}

// Three states, not two -- a bot that's healthy but out of funds is neither
// a clean "Healthy" (there's a real, actionable operational issue) nor a
// "Stale"/danger reading (the process itself isn't broken). See the Bot
// Status computation above for how "warning" gets decided.
const STATE_DOT: Record<HealthState, string> = {
  ok:      "bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]",
  warning: "bg-warning shadow-[0_0_6px_rgba(245,158,11,0.6)]",
  danger:  "bg-danger shadow-[0_0_6px_rgba(239,68,68,0.6)]",
};
const STATE_TEXT: Record<HealthState, string> = {
  ok: "text-white", warning: "text-warning", danger: "text-danger",
};

function StatusDot({ state, title }: { state: HealthState; title?: string }) {
  return <span className={clsx("w-1.5 h-1.5 rounded-full inline-block shrink-0", STATE_DOT[state])} title={title} />;
}

function HealthItem({ label, state, detail }: { label: string; state: HealthState; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <StatusDot state={state} />
      <span className="text-muted">{label}</span>
      <span className={clsx("font-medium", STATE_TEXT[state])}>{detail}</span>
    </div>
  );
}

// ── Result badge (WIN / LOSS / OPEN) ────────────────────────────────────
// Consolidates the old page's separate "Result" and "Status" columns,
// which conveyed overlapping information, into one badge.

function ResultBadge({ status, pnl }: { status: string; pnl: number | null }) {
  let label: string, cls: string;
  if (status !== "closed") {
    label = "OPEN"; cls = "bg-accent/15 text-accent border-accent/20";
  } else if ((pnl ?? 0) >= 0) {
    label = "WIN"; cls = "bg-success/15 text-success border-success/20";
  } else {
    label = "LOSS"; cls = "bg-danger/15 text-danger border-danger/20";
  }
  return (
    <span className={clsx("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}

// ── Open positions (live odds) table ────────────────────────────────────

function PositionsLiveTable({ positions }: { positions: PmPositionLive[] }) {
  return (
    <div className="glass-panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] text-muted text-xs">
            <th className="px-4 py-2 text-left font-medium">Market</th>
            <th className="px-4 py-2 text-left font-medium">Side</th>
            <th className="px-4 py-2 text-left font-medium">Entry</th>
            <th className="px-4 py-2 text-left font-medium">Current</th>
            <th className="px-4 py-2 text-left font-medium">Size</th>
            <th className="px-4 py-2 text-left font-medium">Unrealized P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const pnlPos = p.unrealized_pnl >= 0;
            return (
              <tr key={p.slug} className="border-b border-white/[0.04] last:border-0 hover:bg-white/5">
                <td className="px-4 py-2 text-white max-w-[220px] truncate" title={p.market}>{p.market}</td>
                <td className="px-4 py-2 text-muted">{p.outcome}</td>
                <td className="px-4 py-2 tabnum">{(p.avg_price * 100).toFixed(1)}¢</td>
                <td className="px-4 py-2 tabnum">{(p.current_price * 100).toFixed(1)}¢</td>
                <td className="px-4 py-2 tabnum">${Number(p.invested_usd).toFixed(2)}</td>
                <td className={clsx("px-4 py-2 font-medium tabnum", pnlPos ? "text-success" : "text-danger")}>
                  {pnlPos ? "+" : "−"}${Math.abs(p.unrealized_pnl).toFixed(2)} ({p.pnl_percent.toFixed(1)}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Recent outcomes table ───────────────────────────────────────────────

function ActivityTable({ trades }: { trades: PgTrade[] }) {
  return (
    <div className="glass-panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] text-muted text-xs">
            <th className="px-4 py-2 text-left font-medium">Time</th>
            <th className="px-4 py-2 text-left font-medium">Market</th>
            <th className="px-4 py-2 text-left font-medium">Action</th>
            <th className="px-4 py-2 text-left font-medium">Amount</th>
            <th className="px-4 py-2 text-left font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const market = (t.metadata?.market_title as string | undefined) || t.symbol;
            return (
              <tr key={t.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/5">
                <td className="px-4 py-2 text-muted text-xs whitespace-nowrap">
                  {new Date(t.opened_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-white max-w-[200px] truncate" title={market}>{market}</td>
                <td className="px-4 py-2 text-muted text-xs font-medium">{t.side.toUpperCase()}</td>
                <td className="px-4 py-2 tabnum">${Number(t.cost_usd).toFixed(2)}</td>
                <td className="px-4 py-2">
                  <ResultBadge status={t.status} pnl={t.pnl_usd} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
