import * as googleOAuth from "./googleOAuth";
import type { GoogleConnector } from "./googleOAuth";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const CONNECTOR: GoogleConnector = {
  tokenFile: ".calendar-token.json",
  scope: "https://www.googleapis.com/auth/calendar.readonly",
  redirectUriEnvVar: "CALENDAR_REDIRECT_URI",
  connectPath: "/api/calendar/oauth/start",
};

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location: string;
}

export function buildAuthUrl(): string {
  return googleOAuth.buildAuthUrl(CONNECTOR);
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  return googleOAuth.exchangeCodeForToken(CONNECTOR, code);
}

export async function isConnected(): Promise<boolean> {
  return googleOAuth.isConnected(CONNECTOR);
}

export async function getUpcomingEvents(maxResults = 10): Promise<CalendarEvent[]> {
  const accessToken = await googleOAuth.getAccessToken(CONNECTOR);
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar fetch failed: ${await res.text()}`);
  const { items } = (await res.json()) as {
    items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }[];
  };
  if (!items?.length) return [];

  return items.map((e) => ({
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? "",
  }));
}
