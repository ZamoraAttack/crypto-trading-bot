import type { Trade } from "@/lib/api";
import clsx from "clsx";

export default function PositionCard({ trade }: { trade: Trade }) {
  const live = trade.mode === "live";

  return (
    <div className="relative glass-panel glass-panel-hover p-5 space-y-4 overflow-hidden">

      {/* Gradient shimmer */}
      <div className={clsx(
        "absolute inset-0 opacity-[0.04] pointer-events-none",
        live
          ? "bg-gradient-to-br from-danger via-transparent to-transparent"
          : "bg-gradient-to-br from-accent via-accent-2 to-transparent"
      )} />

      {/* Top accent line */}
      <div className={clsx(
        "absolute top-0 left-0 right-0 h-[1.5px]",
        live
          ? "bg-gradient-to-r from-transparent via-danger/60 to-transparent"
          : "bg-gradient-to-r from-transparent via-accent/60 to-transparent"
      )} />

      {/* Header */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={clsx(
            "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm",
            live ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
          )}>
            {trade.symbol.slice(0, 2)}
          </div>
          <div>
            <p className="font-bold text-white">{trade.symbol}</p>
            <p className="text-xs text-muted">{new Date(trade.opened_at).toLocaleTimeString()}</p>
          </div>
        </div>
        <span className={clsx(
          "text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide border",
          live
            ? "bg-danger/15 text-danger border-danger/20"
            : "bg-accent/15 text-accent border-accent/20"
        )}>
          {trade.mode.toUpperCase()}
        </span>
      </div>

      {/* Price data */}
      <div className="relative grid grid-cols-2 gap-2">
        <DataCell label="Entry"   value={`$${Number(trade.entry_price).toFixed(6)}`} />
        <DataCell label="Size"    value={`$${Number(trade.cost_usd).toFixed(2)}`} />
        <DataCell label="Stop"    value={`$${Number(trade.stop_loss_price).toFixed(6)}`}  color="text-danger" />
        <DataCell label="Target"  value={trade.take_profit_price ? `$${Number(trade.take_profit_price).toFixed(6)}` : "—"} color="text-success" />
        <DataCell label="Qty"     value={Number(trade.quantity).toFixed(4)} />
        <DataCell label="PnL"     value="Live" color="text-muted" />
      </div>
    </div>
  );
}

function DataCell({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass-tile rounded-xl px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx("text-sm font-semibold mt-0.5 tabnum", color)}>{value}</p>
    </div>
  );
}
