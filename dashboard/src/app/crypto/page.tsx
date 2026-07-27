import { api } from "@/lib/api";
import type { PgTrade } from "@/lib/api";
import RiskMeter from "@/components/RiskMeter";
import PgSignalFeed from "@/components/PgSignalFeed";
import PositionCard from "@/components/PositionCard";
import EmergencyStop from "@/components/EmergencyStop";

export const revalidate = 15;

export default async function CryptoPage() {
  const [risk, pgSignals, positions, pgTrades, pgSummary] = await Promise.all([
    api.risk().catch(() => null),
    api.pg.signals("crypto").catch(() => []),
    api.positions().catch(() => []),
    api.pg.trades("crypto").catch(() => [] as PgTrade[]),
    api.pg.summary("crypto").catch(() => null),
  ]);

  const closedTrades = pgTrades.filter(t => t.status !== "open").slice(0, 20);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Crypto Bot</h1>
            <p className="text-muted text-sm">Coinbase Advanced · Spot · Social + Momentum signals</p>
          </div>
          <EmergencyStop />
        </div>

        {/* Summary cards */}
        {pgSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Trades"  value={String(pgSummary.total_trades)} />
            <Stat label="Win Rate"      value={`${pgSummary.win_rate_pct.toFixed(1)}%`}
                  color={pgSummary.win_rate_pct >= 50 ? "text-success" : "text-danger"} />
            <Stat label="Total PnL"     value={`${(pgSummary.total_pnl ?? 0) >= 0 ? "+" : ""}$${(pgSummary.total_pnl ?? 0).toFixed(4)}`}
                  color={(pgSummary.total_pnl ?? 0) >= 0 ? "text-success" : "text-danger"} />
            <Stat label="Open Positions" value={String(pgSummary.open_count)} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Risk panel */}
          <div className="space-y-4">
            {risk && <RiskMeter risk={risk} />}

            {/* Tier 1 watchlist */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Tier 1 Watchlist</h3>
              <div className="space-y-1 text-sm">
                {["XRP", "XLM", "XDC*", "QNT", "HBAR", "SHX*"].map(a => {
                  const sym = a.replace("*", "");
                  const latest = pgSignals.find(s => s.symbol === sym || s.symbol.startsWith(sym + "-"));
                  return (
                    <div key={a} className="flex justify-between">
                      <span className={latest ? "text-white" : "text-muted"}>{a}</span>
                      <span className="text-muted font-mono">
                        {latest ? Number(latest.final_score).toFixed(1) : "—"}
                      </span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted mt-2">* Not listed on Coinbase — monitored only</p>
              </div>
            </div>
          </div>

          {/* Signals feed */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Signal Feed</h3>
            <PgSignalFeed signals={pgSignals} />
          </div>
        </div>

        {/* Open positions */}
        {positions.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-3">Open Positions ({positions.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map(p => <PositionCard key={p.id} trade={p} />)}
            </div>
          </section>
        )}

        {/* Trade history */}
        {closedTrades.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-3">Recent Trades</h3>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-xs">
                    <th className="px-4 py-2 text-left">Symbol</th>
                    <th className="px-4 py-2 text-left">Side</th>
                    <th className="px-4 py-2 text-left">Entry</th>
                    <th className="px-4 py-2 text-left">Exit</th>
                    <th className="px-4 py-2 text-left">Cost</th>
                    <th className="px-4 py-2 text-left">PnL</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map(t => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-white/5">
                      <td className="px-4 py-2 font-medium text-white">{t.symbol}</td>
                      <td className={`px-4 py-2 text-xs font-medium ${t.side === "buy" ? "text-success" : "text-danger"}`}>
                        {t.side.toUpperCase()}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">${Number(t.entry_price).toFixed(6)}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {t.exit_price != null ? `$${Number(t.exit_price).toFixed(6)}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-muted">${Number(t.cost_usd).toFixed(2)}</td>
                      <td className={`px-4 py-2 font-medium ${(t.pnl_usd ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                        {t.pnl_usd != null
                          ? `${t.pnl_usd >= 0 ? "+" : ""}$${Number(t.pnl_usd).toFixed(4)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">{t.status}</td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {new Date(t.opened_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="relative bg-surface-2 border border-border rounded-2xl p-5 shadow-card overflow-hidden hover:border-accent/20 transition-all">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-2 tabnum ${color}`}>{value}</p>
    </div>
  );
}
