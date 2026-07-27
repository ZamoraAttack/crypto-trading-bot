import { api } from "@/lib/api";
import type { PgTrade } from "@/lib/api";
import clsx from "clsx";

export const revalidate = 15;

function pnlColor(pnl: number | null) {
  if (pnl == null) return "text-muted";
  return pnl >= 0 ? "text-success" : "text-danger";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open:         "bg-accent/20 text-accent",
    closed:       "bg-success/20 text-success",
    stopped:      "bg-danger/20 text-danger",
    closed_profit:"bg-success/20 text-success",
    closed_loss:  "bg-danger/20 text-danger",
    cancelled:    "bg-muted/20 text-muted",
  };
  return map[status] ?? "bg-border text-muted";
}

export default async function TradesPage() {
  const [trades, summary] = await Promise.all([
    api.pg.trades().catch(() => [] as PgTrade[]),
    api.pg.summary().catch(() => null),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Trade History</h1>
          <p className="text-muted text-sm mt-0.5">All bots · Postgres unified ledger</p>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Trades"  value={String(summary.total_trades)} />
            <Stat label="Win Rate"
              value={`${summary.win_rate_pct.toFixed(1)}%`}
              color={summary.win_rate_pct >= 50 ? "text-success" : "text-danger"} />
            <Stat label="Total PnL"
              value={`${summary.total_pnl >= 0 ? "+" : ""}$${summary.total_pnl.toFixed(2)}`}
              color={summary.total_pnl >= 0 ? "text-success" : "text-danger"} />
            <Stat label="Open"  value={String(summary.open_count)} />
          </div>
        )}

        {/* Trade table */}
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs">
                <th className="px-4 py-3 text-left">Bot</th>
                <th className="px-4 py-3 text-left">Market</th>
                <th className="px-4 py-3 text-left">Side</th>
                <th className="px-4 py-3 text-left">Entry</th>
                <th className="px-4 py-3 text-left">Exit</th>
                <th className="px-4 py-3 text-left">Cost</th>
                <th className="px-4 py-3 text-left">PnL</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Opened</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted">
                    No trades yet — waiting for first signal to trigger
                  </td>
                </tr>
              )}
              {trades.map(t => (
                <tr key={t.id} className="border-b border-border/40 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium text-accent capitalize">{t.bot_name}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-white max-w-[180px] truncate">
                    {t.symbol}
                  </td>
                  <td className={clsx("px-4 py-2.5 font-medium uppercase text-xs",
                    t.side === "buy" ? "text-success" : "text-danger")}>
                    {t.side}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    ${Number(t.entry_price).toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {t.exit_price ? `$${Number(t.exit_price).toFixed(4)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs">
                    ${Number(t.cost_usd).toFixed(2)}
                  </td>
                  <td className={clsx("px-4 py-2.5 font-semibold text-xs", pnlColor(t.pnl_usd))}>
                    {t.pnl_usd != null
                      ? `${t.pnl_usd >= 0 ? "+" : ""}$${Number(t.pnl_usd).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", statusBadge(t.status))}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full",
                      t.mode === "live" ? "bg-danger/20 text-danger" : "bg-accent/20 text-accent")}>
                      {t.mode}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">
                    {new Date(t.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </main>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
