import { isConnected as isGmailConnected } from "@/lib/gmail";
import { isConnected as isCalendarConnected } from "@/lib/calendar";

export const revalidate = 0;

function ConnectorCard({
  name, account, description, connected, connectHref,
}: {
  name: string; account: string; description: string; connected: boolean; connectHref: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-2xl p-5 flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold text-white text-sm">{name} — {account}</p>
        <p className="text-muted text-xs mt-1">{description}</p>
        <p className="text-muted text-xs mt-1">
          Status: <span className={connected ? "text-success" : "text-muted"}>
            {connected ? "Connected" : "Not connected"}
          </span>
          {connected && " — reconnect weekly (Google Testing-mode tokens expire after 7 days)"}
        </p>
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
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-white">Connectors</h1>
        <p className="text-muted text-sm">External data sources ZAMO can read from</p>
      </div>

      {gmail_connected && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4">
          <p className="text-success text-sm">Gmail connected successfully.</p>
        </div>
      )}
      {gmail_error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <p className="text-danger text-sm">Gmail connection failed: {gmail_error}</p>
        </div>
      )}
      {calendar_connected && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4">
          <p className="text-success text-sm">Calendar connected successfully.</p>
        </div>
      )}
      {calendar_error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <p className="text-danger text-sm">Calendar connection failed: {calendar_error}</p>
        </div>
      )}

      <ConnectorCard
        name="Gmail"
        account="zamoraattack@gmail.com"
        description="Read-only. Primary category only (promotions/spam/social filtered out)."
        connected={gmailConnected}
        connectHref="/api/gmail/oauth/start"
      />
      <ConnectorCard
        name="Calendar"
        account="zamoraattack@gmail.com"
        description="Read-only. Upcoming events on the primary calendar."
        connected={calendarConnected}
        connectHref="/api/calendar/oauth/start"
      />

    </main>
  );
}
