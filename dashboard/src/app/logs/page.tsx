import { api } from "@/lib/api";
import type { PgLog } from "@/lib/api";
import clsx from "clsx";

export const revalidate = 10;

const LEVEL_STYLE: Record<string, string> = {
  INFO:     "bg-accent/20 text-accent",
  WARNING:  "bg-warning/20 text-warning",
  ERROR:    "bg-danger/20 text-danger",
  CRITICAL: "bg-danger text-white",
};

const CATEGORY_STYLE: Record<string, string> = {
  trade:  "text-success",
  signal: "text-accent",
  system: "text-muted",
  risk:   "text-warning",
  api:    "text-purple-400",
};

export default async function LogsPage() {
  const logs = await api.pg.logs().catch(() => [] as PgLog[]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-muted text-sm mt-0.5">Structured event log · all bots · latest 100</p>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs">
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Bot</th>
                <th className="px-4 py-3 text-left">Level</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No logs yet
                  </td>
                </tr>
              )}
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-white/5">
                  <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap font-mono">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium text-accent capitalize">{l.bot_name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium",
                      LEVEL_STYLE[l.level] ?? "bg-border text-muted")}>
                      {l.level}
                    </span>
                  </td>
                  <td className={clsx("px-4 py-2.5 text-xs font-medium",
                    CATEGORY_STYLE[l.category] ?? "text-muted")}>
                    {l.category}
                  </td>
                  <td className="px-4 py-2.5 text-white text-xs max-w-[480px]">
                    {l.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </main>
  );
}
