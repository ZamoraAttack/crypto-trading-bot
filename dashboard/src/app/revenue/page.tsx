import { api } from "@/lib/api";
import type { PgRevenue } from "@/lib/api";
import RevenueChart from "@/components/RevenueChart";
import clsx from "clsx";

export const revalidate = 60;

export default async function RevenuePage() {
  const revenue = await api.pg.revenue().catch(() => null as PgRevenue | null);
  const current = revenue?.current_month;
  const goalPct = Math.min(current?.polymarket_goal_pct ?? 0, 100);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <p className="text-muted text-sm">Combined trading PnL across both bots · rolled up by month</p>
      </div>

      {current ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PnlCard label="Crypto Bot — This Month" value={current.crypto_pnl} />
            <PnlCard label="Polymarket Bot — This Month" value={current.polymarket_pnl}>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>Goal: ${current.polymarket_goal_usd.toFixed(0)}/mo</span>
                  <span>{current.polymarket_goal_pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", current.polymarket_pnl >= 0 ? "bg-success" : "bg-danger")}
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>
            </PnlCard>
            <PnlCard label="Combined — This Month" value={current.total_pnl} />
          </div>

          <div className="bg-surface-2 border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Monthly Trend</h3>
            <RevenueChart monthly={revenue?.monthly ?? []} />
          </div>
        </>
      ) : (
        <div className="bg-surface-2 border border-border rounded-2xl p-5">
          <p className="text-muted text-sm text-center">No revenue data yet — waiting for the first closed trade.</p>
        </div>
      )}

    </main>
  );
}

function PnlCard({ label, value, children }: { label: string; value: number; children?: React.ReactNode }) {
  const pos = value >= 0;
  return (
    <div className="relative bg-surface-2 border border-border rounded-2xl p-5 shadow-card overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={clsx("text-2xl font-bold mt-2 tabnum", pos ? "text-success" : "text-danger")}>
        {pos ? "+" : "−"}${Math.abs(value).toFixed(2)}
      </p>
      {children}
    </div>
  );
}
