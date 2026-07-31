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
import { Diamond, FlaskConical, Landmark } from "lucide-react";

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
      // cool cyan "analytical activity" identity, matching the design system's existing accent-2
      id: "crypto", icon: <XrpIcon />, label: "Crypto Bot", value: zamoValue(cryptoBot),
      color: "#22d3ee", href: "/crypto",
    },
    {
      id: "polymarket", icon: <Diamond />, label: "Polymarket Bot", value: zamoValue(polymarketBot),
      color: "#a855f7", href: "/polymarket",
    },
    {
      id: "20mts", icon: <FlaskConical />, label: "20 MTS", value: "Research phase",
      color: "#f59e0b",
    },
    {
      // Mission 2 — payroll/remittance MVP, not yet built. No href yet (no page to link to),
      // same "placeholder node" pattern 20 MTS used before it had one.
      id: "payroll", icon: <Landmark />, label: "Payroll MVP", value: "Planning phase",
      color: "#10b981",
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

      {/* Overview — trading OS stats, scrolled to below ZAMO. Spacing/hierarchy/typography/
          density study taken from Helios (eyebrow section labels, generous section gaps, one
          oversized "hero" figure per stat row) — layout only, ZAMO's own visual language
          (glass-panel, accent colors) is unchanged.

          Continuity with the hero above: a faint blue light bleed + a thin downward trace line
          at the very top, so this reads as "the Core's light resolving into panels" rather than
          the 3D scene abruptly ending and a separate page starting. Both are purely decorative,
          absolutely positioned, and fade out within the first ~14rem — they don't follow you
          down the page. */}
      <div className="relative">
        {/* light spill reaches a little further down than before (h-56 → h-72), still fading
            to nothing well before the fold */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[42rem] h-72 pointer-events-none -z-10"
          style={{ background: "radial-gradient(50% 100% at 50% 0%, rgba(59,91,219,0.11), rgba(59,91,219,0) 70%)" }}
        />
        {/* three faint traces instead of one, gently fanning — echoes the Core's own multiple
            orbital threads rather than a single generic beam, "faint connection traces" from the
            Core resolving downward into the operational panels */}
        <div
          className="absolute top-0 left-1/2 -translate-x-[calc(50%+10px)] w-px h-16 pointer-events-none -z-10 opacity-60"
          style={{ background: "linear-gradient(180deg, rgba(103,232,249,0.3), rgba(103,232,249,0) 100%)" }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-28 pointer-events-none -z-10"
          style={{ background: "linear-gradient(180deg, rgba(103,232,249,0.38), rgba(103,232,249,0) 100%)" }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-[calc(50%-10px)] w-px h-16 pointer-events-none -z-10 opacity-60"
          style={{ background: "linear-gradient(180deg, rgba(103,232,249,0.3), rgba(103,232,249,0) 100%)" }}
        />
        <main className="relative max-w-7xl mx-auto px-4 py-8 space-y-10">

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Trading OS</h2>
            <p className="text-muted text-sm mt-1">All bots · real-time monitoring</p>
          </div>
          <EmergencyStop />
        </div>

        {bots.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Bots</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {bots.map(b => <BotCard key={b.bot_name} bot={b} />)}
            </div>
          </section>
        )}

        {pgSummary && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <StatCard label="Total PnL"
                value={`${pgSummary.total_pnl >= 0 ? "+" : ""}$${pgSummary.total_pnl.toFixed(2)}`}
                color={pgSummary.total_pnl >= 0 ? "text-success" : "text-danger"}
                hero />
              <StatCard label="Win Rate"
                value={`${pgSummary.win_rate_pct.toFixed(1)}%`}
                color={pgSummary.win_rate_pct >= 50 ? "text-success" : "text-danger"} />
              <StatCard label="Total Trades"
                value={String(pgSummary.total_trades)} />
              <StatCard label="Open Positions"
                value={String(pgSummary.open_count)} />
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">System Status</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="space-y-4">
              {risk          && <RiskMeter risk={risk} />}
              {controlStatus && <SystemHealth status={controlStatus} />}
            </div>

            <div className="lg:col-span-2 glass-panel glass-panel-chamfer p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wide">Latest Signals</h4>
                <Link href="/crypto" className="text-xs text-accent hover:underline">View all →</Link>
              </div>
              <PgSignalFeed signals={pgSignals.slice(0, 10)} />
            </div>
          </div>
        </section>

        {positions.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">
              Open Positions <span className="text-white/70 normal-case tracking-normal">({positions.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {positions.map(p => <PositionCard key={p.id} trade={p} />)}
            </div>
          </section>
        )}

      </main>
      </div>
    </>
  );
}

function StatCard({ label, value, color = "text-white", hero = false }: { label: string; value: string; color?: string; hero?: boolean }) {
  return (
    <div className="relative glass-panel glass-panel-hover p-5 overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      {/* one oversized "hero" figure per stat row, Helios-style — the rest stay the same size
          they always were so this reads as emphasis, not a new default */}
      <p className={`${hero ? "text-4xl" : "text-2xl"} font-bold mt-2 tabnum ${color}`}>{value}</p>
    </div>
  );
}
