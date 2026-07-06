import { api } from "@/lib/api";
import NavBar from "@/components/NavBar";
import RiskMeter from "@/components/RiskMeter";
import SystemHealth from "@/components/SystemHealth";
import EmergencyStop from "@/components/EmergencyStop";
import PgSignalFeed from "@/components/PgSignalFeed";
import PositionCard from "@/components/PositionCard";
import BotCard from "@/components/BotCard";
import Link from "next/link";

export const revalidate = 15;

export default async function OverviewPage() {
  const [risk, controlStatus, positions, bots, pgSummary, pgSignals] = await Promise.all([
    api.risk().catch(() => null),
    api.controlStatus().catch(() => null),
    api.positions().catch(() => []),
    api.pg.bots().catch(() => []),
    api.pg.summary().catch(() => null),
    api.pg.signals().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Trading OS</h1>
            <p className="text-muted text-sm mt-0.5">All bots · real-time monitoring</p>
          </div>
          <EmergencyStop />
        </div>

        {/* Bot heartbeat cards */}
        {bots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bots.map(b => <BotCard key={b.bot_name} bot={b} />)}
          </div>
        )}

        {/* Unified stats row */}
        {pgSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Trades"
              value={String(pgSummary.total_trades)} />
            <StatCard label="Win Rate"
              value={`${pgSummary.win_rate_pct.toFixed(1)}%`}
              color={pgSummary.win_rate_pct >= 50 ? "text-success" : "text-danger"} />
            <StatCard label="Total PnL"
              value={`${pgSummary.total_pnl >= 0 ? "+" : ""}$${pgSummary.total_pnl.toFixed(2)}`}
              color={pgSummary.total_pnl >= 0 ? "text-success" : "text-danger"} />
            <StatCard label="Open Positions"
              value={String(pgSummary.open_count)} />
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: risk + health */}
          <div className="space-y-4">
            {risk          && <RiskMeter risk={risk} />}
            {controlStatus && <SystemHealth status={controlStatus} />}
          </div>

          {/* Centre: signals */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Latest Signals</h3>
              <Link href="/crypto" className="text-xs text-accent hover:underline">View all →</Link>
            </div>
            <PgSignalFeed signals={pgSignals.slice(0, 10)} />
          </div>
        </div>

        {/* Open positions */}
        {positions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">
              Open Positions ({positions.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map(p => <PositionCard key={p.id} trade={p} />)}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function StatCard({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="relative bg-surface-2 border border-border rounded-2xl p-5 shadow-card overflow-hidden group hover:border-accent/20 transition-all">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-2 tabnum ${color}`}>{value}</p>
    </div>
  );
}
