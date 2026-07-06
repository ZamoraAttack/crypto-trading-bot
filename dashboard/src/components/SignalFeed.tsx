import type { Signal } from "@/lib/api";
import clsx from "clsx";

export default function SignalFeed({ signals }: { signals: Signal[] }) {
  if (!signals.length) {
    return <p className="text-muted text-sm">No signals yet — waiting for next scan cycle.</p>;
  }

  return (
    <div className="space-y-2">
      {signals.map(s => (
        <div
          key={s.id}
          className={clsx(
            "flex items-center gap-3 bg-surface border rounded-lg px-4 py-3",
            s.action === "executed" ? "border-success/40" :
            s.action === "approved" ? "border-accent/40"  :
            s.action === "rejected" ? "border-border"     :
            "border-border"
          )}
        >
          {/* Asset */}
          <span className="font-semibold text-white w-12 shrink-0">{s.symbol}</span>

          {/* Score bar */}
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full",
                s.final_score >= 75 ? "bg-success" :
                s.final_score >= 55 ? "bg-warning"  : "bg-muted"
              )}
              style={{ width: `${s.final_score}%` }}
            />
          </div>
          <span className="text-sm font-mono text-white w-10 text-right shrink-0">
            {s.final_score.toFixed(1)}
          </span>

          {/* Action */}
          <span className={clsx(
            "text-xs shrink-0",
            s.action === "executed" ? "text-success" :
            s.action === "approved" ? "text-accent"  :
            s.action === "rejected" ? "text-muted"   : "text-muted"
          )}>
            {s.action}
          </span>
        </div>
      ))}
    </div>
  );
}
