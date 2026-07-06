import type { RiskState } from "@/lib/api";
import clsx from "clsx";

export default function RiskMeter({ risk }: { risk: RiskState }) {
  const pct      = Math.abs(risk.pnl_pct);
  const maxPct   = risk.max_daily_loss_pct;
  const fillPct  = Math.min((pct / maxPct) * 100, 100);
  const isProfit = risk.realized_pnl >= 0;

  const barClass =
    risk.trading_halted ? "bg-danger" :
    fillPct > 75        ? "score-bar-fill-warn" :
                          "score-bar-fill-success";

  const fgColor =
    risk.fear_greed_value <= 24 ? "text-danger"  :
    risk.fear_greed_value <= 44 ? "text-warning" :
    risk.fear_greed_value <= 55 ? "text-white"   :
    risk.fear_greed_value <= 75 ? "text-success" : "text-warning";

  return (
    <div className="bg-surface-2 border border-border rounded-2xl p-5 space-y-4 shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Daily Risk</h3>
        {risk.trading_halted ? (
          <span className="text-xs bg-danger/15 text-danger border border-danger/20 rounded-full px-2.5 py-0.5 font-semibold">
            HALTED
          </span>
        ) : (
          <span className="text-xs bg-success/15 text-success border border-success/20 rounded-full px-2.5 py-0.5 font-semibold">
            ACTIVE
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Daily loss used</span>
          <span className={clsx("font-semibold tabnum", isProfit ? "text-success" : "text-danger")}>
            {isProfit ? "+" : ""}{Number(risk.realized_pnl).toFixed(4)} USD&nbsp;
            <span className="text-muted font-normal">
              ({isProfit ? "+" : ""}{Number(risk.pnl_pct).toFixed(2)}%)
            </span>
          </span>
        </div>
        <div className="h-2.5 bg-background rounded-full overflow-hidden">
          <div
            className={clsx("h-full rounded-full transition-all duration-500", barClass)}
            style={{ width: `${fillPct || 1}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>0%</span>
          <span>Max {maxPct}%</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Balance", value: `$${Number(risk.current_balance).toFixed(2)}`, mono: true },
          { label: "Trades",  value: String(risk.trades_count), mono: false },
          { label: "Mode",    value: risk.trading_mode.toUpperCase(),
            highlight: risk.trading_mode === "live" },
        ].map(s => (
          <div key={s.label} className="bg-background/60 rounded-xl p-2.5 text-center">
            <p className="text-xs text-muted">{s.label}</p>
            <p className={clsx(
              "text-sm font-semibold mt-0.5",
              s.highlight ? "text-warning" : "text-white",
              s.mono && "tabnum"
            )}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Fear & Greed */}
      {risk.fear_greed_value !== undefined && (
        <div className="border-t border-white/5 pt-3 flex items-center justify-between">
          <span className="text-xs text-muted">Fear &amp; Greed</span>
          <div className="flex items-center gap-2">
            <div className={clsx(
              "h-1.5 w-16 bg-background rounded-full overflow-hidden"
            )}>
              <div
                className={clsx("h-full rounded-full transition-all", fgColor === "text-danger" ? "bg-danger" : fgColor === "text-warning" ? "bg-warning" : fgColor === "text-success" ? "bg-success" : "bg-white")}
                style={{ width: `${risk.fear_greed_value}%` }}
              />
            </div>
            <span className={clsx("text-xs font-semibold tabnum", fgColor)}>
              {risk.fear_greed_value} — {risk.fear_greed_label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
