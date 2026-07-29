import * as googleOAuth from "./googleOAuth";
import type { GoogleConnector } from "./googleOAuth";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const CONNECTOR: GoogleConnector = {
  tokenFile: ".gmail-token.json",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  redirectUriEnvVar: "GMAIL_REDIRECT_URI",
  connectPath: "/api/gmail/oauth/start",
};

interface GmailMessage {
  from: string;
  subject: string;
  snippet: string;
  date: string;
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

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function searchEmails(query: string, maxResults = 10): Promise<GmailMessage[]> {
  const accessToken = await googleOAuth.getAccessToken(CONNECTOR);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // Always restrict to Gmail's own "Primary" category so promotions/spam/social never surface.
  const q = `category:primary ${query}`.trim();
  const listRes = await fetch(
    `${GMAIL_API}/messages?${new URLSearchParams({ q, maxResults: String(maxResults) })}`,
    { headers: authHeaders },
  );
  if (!listRes.ok) throw new Error(`Gmail search failed: ${await listRes.text()}`);
  const { messages } = (await listRes.json()) as { messages?: { id: string }[] };
  if (!messages?.length) return [];

  const detailed = await Promise.all(
    messages.map(async (m) => {
      const res = await fetch(
        `${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: authHeaders },
      );
      const data = (await res.json()) as { snippet: string; payload: { headers: { name: string; value: string }[] } };
      const headers = data.payload.headers;
      return {
        from: header(headers, "From"),
        subject: header(headers, "Subject"),
        date: header(headers, "Date"),
        snippet: data.snippet,
      };
    }),
  );
  return detailed;
}
