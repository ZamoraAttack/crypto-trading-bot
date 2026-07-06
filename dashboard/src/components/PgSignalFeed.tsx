import type { PgSignal } from "@/lib/api";
import clsx from "clsx";

export default function PgSignalFeed({ signals }: { signals: PgSignal[] }) {
  if (!signals.length) {
    return <p className="text-muted text-sm">No signals yet — waiting for next scan cycle.</p>;
  }

  // Keep only the latest signal per symbol, sorted by score descending
  const latest = Object.values(
    signals.reduce<Record<string, PgSignal>>((acc, s) => {
      const key = `${s.bot_name}:${s.symbol}`;
      if (!acc[key]) acc[key] = s;
      return acc;
    }, {})
  ).sort((a, b) => Number(b.final_score) - Number(a.final_score));

  return (
    <div className="space-y-1.5">
      {latest.map(s => {
        const score    = Number(s.final_score);
        const executed = s.action === "executed" || s.action === "approved";
        const rejected = s.action === "rejected";

        return (
          <div
            key={s.id}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 border transition-all",
              executed ? "bg-success/5 border-success/20"  :
              rejected ? "bg-white/[0.02] border-white/5"  :
                         "bg-white/[0.02] border-white/5 hover:border-accent/20"
            )}
          >
            {/* Bot badge */}
            <span className="text-[10px] font-bold border rounded px-1.5 py-0.5 shrink-0 bg-accent/10 text-accent border-accent/25 uppercase tracking-wider">
              {s.bot_name}
            </span>

            {/* Symbol */}
            <span className="font-semibold text-white w-12 shrink-0 text-sm">{s.symbol}</span>

            {/* Score bar */}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-500",
                    score >= 65 ? "score-bar-fill-success" :
                    score >= 45 ? "score-bar-fill"          : "bg-muted/50"
                  )}
                  style={{ width: `${Math.min(score, 100)}%` }}
                />
              </div>
              <span className={clsx(
                "text-xs font-mono font-semibold tabnum w-9 text-right shrink-0",
                score >= 65 ? "text-success" : score >= 45 ? "text-accent-2" : "text-muted"
              )}>
                {score.toFixed(1)}
              </span>
            </div>

            {/* Action badge */}
            <span className={clsx(
              "text-[10px] font-semibold shrink-0 px-2 py-0.5 rounded-full border",
              executed ? "bg-success/15 text-success border-success/25" :
              rejected ? "bg-white/5 text-muted border-white/10"        :
                         "bg-accent/10 text-accent border-accent/20"
            )}>
              {s.action}
            </span>
          </div>
        );
      })}
    </div>
  );
}
