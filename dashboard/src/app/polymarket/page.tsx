import { api } from "@/lib/api";
import type { PgTrade, PgBotStatus, PmPositionLive, PmEquityCurve, PmStats } from "@/lib/api";
import EquityCurveChart from "@/components/EquityCurveChart";
import clsx from "clsx";

export const revalidate = 30;

export default async function PolymarketPage() {
  // revalidate: 30 matches this route's own `export const revalidate = 30`
  // above. Without it on every fetch here, a single no-store call is enough
  // to force the whole route dynamic and defeat that setting — every
  // navigation would re-run this full 7-way fetch from scratch, including
  // the ~3s bullpen CLI round trip on a cold cache (see api/polymarket.py's
  // positions/live cache). These endpoints are opt-in per call (see
  // FetchOpts in api.ts) specifically so this doesn't change freshness for
  // any other page that shares the same underlying wrapper functions.
  const cache30 = { revalidate: 30 };
  const [bots, pgTrades, pmStats, livePositions, balances, equity, logs] = await Promise.all([
    api.pg.bots(cache30).catch(() => []),
    api.pg.trades("polymarket", undefined, cache30).catch(() => [] as PgTrade[]),
    api.polymarketStats(cache30).catch(() => null as PmStats | null),
    api.polymarketPositionsLive(cache30).catch(() => [] as PmPositionLive[]),
    api.pg.balances("polymarket", cache30).catch(() => []),
    api.polymarketEquityCurve(cache30).catch(() => null as PmEquityCurve | null),
    api.polymarketLogs(50, cache30).catch(() => ({ lines: [] as string[] })),
  ]);

  const bot     = bots.find(b => b.bot_name === "polymarket");
  const balance = balances[0]; // most recent snapshot
  const totalUsd     = Number(balance?.total_usd ?? 0);
  const availableUsd = Number(balance?.available_usd ?? 0);
  const lockedUsd     = Number(balance?.locked_usd ?? 0);

  const totalExposure   = livePositions.reduce((s, p) => s + Number(p.current_value ?? 0), 0);
  const largestPosition = livePositions.reduce((m, p) => Math.max(m, Number(p.current_value ?? 0)), 0);
  const largestPositionPct = totalUsd ? (largestPosition / totalUsd) * 100 : 0;
  const cashAllocationPct  = totalUsd ? (availableUsd / totalUsd) * 100 : 0;
  const capitalDeployedPct = totalUsd ? (lockedUsd / totalUsd) * 100 : 0;

  const lastCycleRuntime = parseLastCycleRuntime(logs.lines);
  const dbHealthy  = bots.length > 0 || balances.length > 0;
  const apiHealthy = !!bot && bot.status === "running" &&
    (Date.now() - new Date(bot.last_heartbeat).getTime()) / 1000 < 90;

  const recentTrades = [...pgTrades]
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, 30);

  return (
    <div className="min-h-screen bg-[#0F1117]">
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-[#E6EDF3]">

        <div>
          <h1 className="text-2xl font-bold text-[#E6EDF3]">Polymarket Bot</h1>
          <p className="text-[#6B7280] text-sm">Copy-trade bot · Prediction markets</p>
        </div>

        {bot ? (
          <>
            {/* KPI row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi label="Account Balance" value={`$${totalUsd.toFixed(2)}`} />
              <PnlKpi label="Today's P&L" value={Number(bot.daily_pnl_usd ?? 0)} />
              <Kpi label="Win Rate" value={`${(pmStats?.win_rate ?? 0).toFixed(1)}%`} />
              <Kpi label="Open Markets" value={String(livePositions.length)} />
            </div>

            {/* KPI row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PnlKpi label="Total P&L" value={pmStats?.total_pnl ?? 0} />
              <Kpi label="Max Drawdown" value={`$${(equity?.max_drawdown_usd ?? 0).toFixed(2)}`} sub={`${(equity?.max_drawdown_pct ?? 0).toFixed(1)}%`} />
              <Kpi label="Capital Deployed" value={`$${lockedUsd.toFixed(2)}`} />
              <Kpi label="Available Cash" value={`$${availableUsd.toFixed(2)}`} />
            </div>

            {/* Equity curve */}
            <Card>
              <h3 className="text-sm font-semibold text-[#E6EDF3] mb-2">Equity Curve</h3>
              <EquityCurveChart points={equity?.points ?? []} />
            </Card>

            {/* Open positions */}
            <section>
              <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Open Positions ({livePositions.length})</h3>
              {livePositions.length > 0 ? (
                <PositionsLiveTable positions={livePositions} />
              ) : (
                <Card><p className="text-[#6B7280] text-sm">No open positions.</p></Card>
              )}
            </section>

            {/* Risk & Exposure + System Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Risk &amp; Exposure</h3>
                <div className="space-y-2 text-sm">
                  <Row label="Total Exposure" value={`$${totalExposure.toFixed(2)}`} />
                  <Row label="Open Markets" value={String(livePositions.length)} />
                  <Row label="Largest Position %" value={`${largestPositionPct.toFixed(1)}%`} />
                  <Row label="Cash Allocation %" value={`${cashAllocationPct.toFixed(1)}%`} />
                  <Row label="Capital Deployed %" value={`${capitalDeployedPct.toFixed(1)}%`} />
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">System Health</h3>
                <div className="space-y-2 text-sm">
                  <Row label="Polymarket API Status" value={apiHealthy ? "Healthy" : "Stale"}
                       valueClass={apiHealthy ? "text-[#22C55E]" : "text-[#EF4444]"} />
                  <Row label="Database Status" value={dbHealthy ? "Connected" : "Disconnected"}
                       valueClass={dbHealthy ? "text-[#22C55E]" : "text-[#EF4444]"} />
                  <Row label="Last Sync Time" value={timeAgo(bot.last_heartbeat)} />
                  <Row label="Bot Uptime" value={formatDuration(bot.cycle_count * 30)} />
                  <Row label="Last Cycle Runtime" value={lastCycleRuntime ?? "—"} />
                </div>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <p className="text-[#6B7280] text-sm text-center">Polymarket bot has not sent a heartbeat yet.</p>
          </Card>
        )}

        {/* Recent activity */}
        {recentTrades.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">
              Recent Activity ({pmStats?.total_activity ?? recentTrades.length} total, {pmStats?.trades_24h ?? 0} in last 24h)
            </h3>
            <ActivityTable trades={recentTrades} />
          </section>
        )}

        {!bot && pgTrades.length === 0 && livePositions.length === 0 && (
          <Card>
            <p className="text-[#6B7280] text-center">No Polymarket bot data yet — waiting for first heartbeat.</p>
          </Card>
        )}

      </main>
    </div>
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours  = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) return `${hours}h ${remMin}m`;
  const days     = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function parseLastCycleRuntime(lines: string[]): string | null {
  const re = /Cycle done in ([\d.]+)s/;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(re);
    if (m) return `${m[1]}s`;
  }
  return null;
}

// ── Layout primitives ────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#161B22] border border-[#2A2F3A] rounded-xl p-4">
      {children}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs text-[#6B7280]">{label}</p>
      <p className="text-xl font-bold mt-1 tabnum text-[#E6EDF3]">{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-0.5">{sub}</p>}
    </Card>
  );
}

function PnlKpi({ label, value }: { label: string; value: number }) {
  const pos = value >= 0;
  return (
    <Card>
      <p className="text-xs text-[#6B7280]">{label}</p>
      <p className={clsx("text-xl font-bold mt-1 tabnum", pos ? "text-[#22C55E]" : "text-[#EF4444]")}>
        {pos ? "+" : "-"}${Math.abs(value).toFixed(2)}
      </p>
    </Card>
  );
}

function Row({ label, value, valueClass = "text-[#E6EDF3]" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#6B7280]">{label}</span>
      <span className={clsx("font-medium tabnum", valueClass)}>{value}</span>
    </div>
  );
}

// ── Open positions (live odds) table ────────────────────────────────────

function PositionsLiveTable({ positions }: { positions: PmPositionLive[] }) {
  return (
    <div className="bg-[#161B22] border border-[#2A2F3A] rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2A2F3A] text-[#6B7280] text-xs">
            <th className="px-4 py-2 text-left">Market</th>
            <th className="px-4 py-2 text-left">Side</th>
            <th className="px-4 py-2 text-left">Entry Price</th>
            <th className="px-4 py-2 text-left">Current Odds</th>
            <th className="px-4 py-2 text-left">Position Size</th>
            <th className="px-4 py-2 text-left">Unrealized P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const pnlPos = p.unrealized_pnl >= 0;
            return (
              <tr key={p.slug} className="border-b border-[#2A2F3A]/60 hover:bg-white/5">
                <td className="px-4 py-2 text-[#E6EDF3] max-w-[260px] truncate" title={p.market}>{p.market}</td>
                <td className="px-4 py-2 text-[#6B7280]">{p.outcome}</td>
                <td className="px-4 py-2 tabnum">{(p.avg_price * 100).toFixed(1)}¢</td>
                <td className="px-4 py-2 tabnum">{(p.current_price * 100).toFixed(1)}¢</td>
                <td className="px-4 py-2 tabnum">${Number(p.invested_usd).toFixed(2)}</td>
                <td className={clsx("px-4 py-2 font-medium tabnum", pnlPos ? "text-[#22C55E]" : "text-[#EF4444]")}>
                  {pnlPos ? "+" : "-"}${Math.abs(p.unrealized_pnl).toFixed(2)} ({p.pnl_percent.toFixed(1)}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Recent activity table ───────────────────────────────────────────────

function ActivityTable({ trades }: { trades: PgTrade[] }) {
  return (
    <div className="bg-[#161B22] border border-[#2A2F3A] rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2A2F3A] text-[#6B7280] text-xs">
            <th className="px-4 py-2 text-left">Timestamp</th>
            <th className="px-4 py-2 text-left">Market</th>
            <th className="px-4 py-2 text-left">Action</th>
            <th className="px-4 py-2 text-left">Amount</th>
            <th className="px-4 py-2 text-left">Result</th>
            <th className="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const market = (t.metadata?.market_title as string | undefined) || t.symbol;
            const result = t.status === "closed"
              ? ((t.pnl_usd ?? 0) >= 0 ? "WIN" : "LOSS")
              : "OPEN";
            return (
              <tr key={t.id} className="border-b border-[#2A2F3A]/60 hover:bg-white/5">
                <td className="px-4 py-2 text-[#6B7280] text-xs whitespace-nowrap">
                  {new Date(t.opened_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-[#E6EDF3] max-w-[240px] truncate" title={market}>{market}</td>
                <td className="px-4 py-2 text-[#6B7280] text-xs font-medium">{t.side.toUpperCase()}</td>
                <td className="px-4 py-2 tabnum">${Number(t.cost_usd).toFixed(2)}</td>
                <td className={clsx("px-4 py-2 font-medium text-xs",
                  result === "WIN" ? "text-[#22C55E]" : result === "LOSS" ? "text-[#EF4444]" : "text-[#6B7280]")}>
                  {result}
                </td>
                <td className="px-4 py-2 text-[#6B7280] text-xs">{t.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
