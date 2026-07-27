import { api, type PgBotStatus } from "@/lib/api";
import RiskMeter from "@/components/RiskMeter";
import SystemHealth from "@/components/SystemHealth";
import EmergencyStop from "@/components/EmergencyStop";
import PgSignalFeed from "@/components/PgSignalFeed";
import PositionCard from "@/components/PositionCard";
import BotCard from "@/components/BotCard";
import Link from "next/link";
import ZamoScene, { type ZamoNodeConfig } from "@/components/jarvis/ZamoScene";
import ClockReadout from "@/components/jarvis/ClockReadout";
import VoiceControl from "@/components/jarvis/VoiceControl";
import XrpIcon from "@/components/jarvis/XrpIcon";
import { Diamond, FlaskConical } from "lucide-react";

export const revalidate = 15;

function heartbeatStale(ts: string): boolean {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  return diff > 180;
}

function zamoValue(bot: PgBotStatus | undefined): string {
  if (!bot) return "No data";
  if (bot.status !== "running" || heartbeatStale(bot.last_heartbeat)) return "Offline";
  const pnl = Number(bot.daily_pnl_usd);
  const sign = pnl >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(pnl).toFixed(2)} today`;
}

export default async function OverviewPage() {
  const [risk, controlStatus, positions, bots, pgSummary, pgSignals] = await Promise.all([
    api.risk().catch(() => null),
    api.controlStatus().catch(() => null),
    api.positions().catch(() => []),
    api.pg.bots().catch(() => [] as PgBotStatus[]),
    api.pg.summary().catch(() => null),
    api.pg.signals().catch(() => []),
  ]);

  const cryptoBot     = bots.find(b => b.bot_name === "crypto");
  const polymarketBot = bots.find(b => b.bot_name === "polymarket");

  const nodes: ZamoNodeConfig[] = [
    {
      id: "crypto", icon: <XrpIcon />, label: "Crypto Bot", value: zamoValue(cryptoBot),
      color: "#3b82f6", hoverRadius: 3.74, tiltX: 0.4, tiltZ: 0.1,
      basePhase: 0.5, swayAmplitude: 0.14, swaySpeed: 0.35,
      href: "/crypto",
    },
    {
      id: "polymarket", icon: <Diamond />, label: "Polymarket Bot", value: zamoValue(polymarketBot),
      color: "#a855f7", hoverRadius: 4.18, tiltX: 0.5, tiltZ: -0.15,
      basePhase: 2.6, swayAmplitude: 0.12, swaySpeed: 0.28,
      href: "/polymarket",
    },
    {
      id: "20mts", icon: <FlaskConical />, label: "20 MTS", value: "Research phase",
      color: "#f59e0b", hoverRadius: 3.9, tiltX: 0.35, tiltZ: 0.2,
      basePhase: 4.7, swayAmplitude: 0.16, swaySpeed: 0.22, nudge: [1.5, 1.0, 0],
    },
  ];

  return (
    <>
      {/* ZAMO — the first thing you see, fills exactly one screen, scroll for the rest */}
      <div className="relative w-full h-screen overflow-hidden">
        <ZamoScene planets={nodes} />

        <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center pointer-events-none z-10">
          <h1 className="text-4xl font-bold tracking-[0.15em] gradient-text">ZAMO</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted mt-1">Zamora Advanced Machine Operations</p>
        </div>

        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
          <ClockReadout />
        </div>

        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
          <VoiceControl />
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none z-10 animate-pulse-slow">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Scroll for overview ↓</p>
        </div>
      </div>

      {/* Overview — trading OS stats, scrolled to below ZAMO */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Trading OS</h2>
            <p className="text-muted text-sm mt-0.5">All bots · real-time monitoring</p>
          </div>
          <EmergencyStop />
        </div>

        {bots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bots.map(b => <BotCard key={b.bot_name} bot={b} />)}
          </div>
        )}

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-4">
            {risk          && <RiskMeter risk={risk} />}
            {controlStatus && <SystemHealth status={controlStatus} />}
          </div>

          <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Latest Signals</h3>
              <Link href="/crypto" className="text-xs text-accent hover:underline">View all →</Link>
            </div>
            <PgSignalFeed signals={pgSignals.slice(0, 10)} />
          </div>
        </div>

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
    </>
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
