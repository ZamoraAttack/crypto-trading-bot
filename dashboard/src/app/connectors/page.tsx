import { isConnected as isGmailConnected } from "@/lib/gmail";
import { isConnected as isCalendarConnected } from "@/lib/calendar";
import { Mail, Calendar, type LucideIcon } from "lucide-react";

export const revalidate = 0;

function ConnectorCard({
  icon: Icon, name, account, description, connected, connectHref,
}: {
  icon: LucideIcon; name: string; account: string; description: string; connected: boolean; connectHref: string;
}) {
  return (
    <div className="glass-panel glass-panel-hover p-5 flex items-center justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 shrink-0 rounded-lg glass-tile flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-accent-2" strokeWidth={1.75} />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{name} — {account}</p>
          <p className="text-muted text-xs mt-1">{description}</p>
          <p className="text-xs mt-1.5">
            <span className={`inline-flex items-center gap-1.5 ${connected ? "text-success" : "text-muted"}`}>
              <span className={`w-[6px] h-[6px] rounded-full ${connected ? "bg-success" : "bg-white/25"}`} />
              {connected ? "Connected" : "Not connected"}
            </span>
            {connected && <span className="text-muted"> — reconnect weekly (Google Testing-mode tokens expire after 7 days)</span>}
          </p>
        </div>
      </div>
      <a
        href={connectHref}
        className="shrink-0 text-xs font-medium px-3 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors whitespace-nowrap"
      >
        {connected ? "Reconnect" : "Connect"}
      </a>
    </div>
  );
}

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string; calendar_connected?: string; calendar_error?: string }>;
}) {
  const { gmail_connected, gmail_error, calendar_connected, calendar_error } = await searchParams;
  const [gmailConnected, calendarConnected] = await Promise.all([isGmailConnected(), isCalendarConnected()]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Connectors</h1>
        <p className="text-muted text-sm mt-1">External data sources ZAMO can read from</p>
      </div>

      {gmail_connected && (
        <div className="glass-panel border-success/30 p-4">
          <p className="text-success text-sm">Gmail connected successfully.</p>
        </div>
      )}
      {gmail_error && (
        <div className="glass-panel border-danger/30 p-4">
          <p className="text-danger text-sm">Gmail connection failed: {gmail_error}</p>
        </div>
      )}
      {calendar_connected && (
        <div className="glass-panel border-success/30 p-4">
          <p className="text-success text-sm">Calendar connected successfully.</p>
        </div>
      )}
      {calendar_error && (
        <div className="glass-panel border-danger/30 p-4">
          <p className="text-danger text-sm">Calendar connection failed: {calendar_error}</p>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Connected Sources</h3>
        <div className="space-y-3">
          <ConnectorCard
            icon={Mail}
            name="Gmail"
            account="zamoraattack@gmail.com"
            description="Read-only. Primary category only (promotions/spam/social filtered out)."
            connected={gmailConnected}
            connectHref="/api/gmail/oauth/start"
          />
          <ConnectorCard
            icon={Calendar}
            name="Calendar"
            account="zamoraattack@gmail.com"
            description="Read-only. Upcoming events on the primary calendar."
            connected={calendarConnected}
            connectHref="/api/calendar/oauth/start"
          />
        </div>
      </section>

    </main>
  );
}
