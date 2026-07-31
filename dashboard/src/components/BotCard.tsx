import clsx from "clsx";

export interface BotStatus {
  bot_name:       string;
  status:         string;
  mode:           string;
  last_heartbeat: string;
  cycle_count:    number;
  open_positions: number;
  daily_pnl_usd:  number;
}

function heartbeatAge(ts: string): { label: string; stale: boolean } {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return { label: `${diff}s ago`,               stale: false };
  if (diff < 3600) return { label: `${Math.floor(diff/60)}m ago`, stale: diff > 180 };
  return { label: `${Math.floor(diff/3600)}h ago`, stale: true };
}

const BOT_ICONS: Record<string, string> = {
  crypto:     "₿",
  polymarket: "◈",
};

export default function BotCard({ bot }: { bot: BotStatus }) {
  const running = bot.status === "running";
  const hb      = heartbeatAge(bot.last_heartbeat);
  const pnlPos  = Number(bot.daily_pnl_usd) >= 0;
  const live    = bot.mode === "live";

  return (
    <div className="relative glass-panel glass-panel-hover p-5 space-y-4 overflow-hidden">

      {/* Subtle gradient background */}
      <div className={clsx(
        "absolute inset-0 opacity-[0.03] pointer-events-none",
        running && !hb.stale
          ? "bg-gradient-to-br from-success via-transparent to-transparent"
          : "bg-gradient-to-br from-accent via-transparent to-transparent"
      )} />

      {/* Header */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status ring */}
          <div className="relative">
            <div className={clsx(
              "w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold",
              running && !hb.stale ? "bg-success/15 text-success" : "bg-border text-muted"
            )}>
              {BOT_ICONS[bot.bot_name] ?? "⬡"}
            </div>
            <div className={clsx(
              "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-2",
              running && !hb.stale ? "bg-success animate-pulse-slow" :
              running && hb.stale  ? "bg-warning animate-pulse"      : "bg-danger"
            )} />
          </div>
          <div>
            <p className="font-bold text-white uppercase tracking-wide text-xs">{bot.bot_name} Bot</p>
            <p className={clsx("text-xs", hb.stale ? "text-warning" : "text-muted")}>
              {hb.label}
            </p>
          </div>
        </div>
        <span className={clsx(
          "text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide",
          live ? "bg-danger/15 text-danger border border-danger/20" : "bg-accent/15 text-accent border border-accent/20"
        )}>
          {bot.mode.toUpperCase()}
        </span>
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-3 gap-3">
        {[
          { label: "Cycles",     value: bot.cycle_count.toLocaleString() },
          { label: "Open",       value: String(bot.open_positions) },
          { label: "Heartbeat",  value: hb.label },
        ].map(s => (
          <div key={s.label} className="glass-tile rounded-xl p-2.5 text-center">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="text-sm font-semibold text-white mt-0.5 tabnum">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Daily PnL */}
      <div className="relative border-t border-white/5 pt-3 flex items-center justify-between">
        <span className="text-xs text-muted">Daily PnL</span>
        <span className={clsx(
          "text-sm font-bold tabnum",
          pnlPos ? "text-success" : "text-danger"
        )}>
          {pnlPos ? "+" : "−"}${Math.abs(Number(bot.daily_pnl_usd)).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
