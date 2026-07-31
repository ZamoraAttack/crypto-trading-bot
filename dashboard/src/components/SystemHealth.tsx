import type { ControlStatus } from "@/lib/api";
import clsx from "clsx";

interface HealthItem {
  label:  string;
  ok:     boolean;
  detail: string;
}

export default function SystemHealth({ status }: { status: ControlStatus }) {
  const items: HealthItem[] = [
    { label: "API",           ok: true,                    detail: "Connected" },
    { label: "Trading mode",  ok: true,                    detail: status.trading_mode.toUpperCase() },
    { label: "Coinbase keys", ok: status.coinbase_keys,    detail: status.coinbase_keys ? "Configured" : "Not set — paper only" },
    { label: "Social scoring",ok: true,                    detail: "CoinGecko + Fear & Greed" },
    { label: "Trading",       ok: !status.trading_halted,  detail: status.trading_halted ? `Halted: ${status.halt_reason}` : "Running" },
  ];

  return (
    <div className="glass-panel p-5 space-y-3">
      <h3 className="text-xs font-bold text-white uppercase tracking-wide">System Health</h3>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
            <div className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              item.ok ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-warning shadow-[0_0_6px_rgba(245,158,11,0.6)]"
            )} />
            <span className="text-xs text-muted w-28 shrink-0">{item.label}</span>
            <span className={clsx("text-xs font-medium", item.ok ? "text-white" : "text-warning")}>
              {item.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
