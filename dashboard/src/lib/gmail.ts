import { readFile, writeFile } from "fs/promises";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), ".gmail-token.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface StoredToken {
  refresh_token: string;
  connected_at: string;
}

interface GmailMessage {
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

function clientCreds() {
  const client_id = process.env.GMAIL_CLIENT_ID;
  const client_secret = process.env.GMAIL_CLIENT_SECRET;
  const redirect_uri = process.env.GMAIL_REDIRECT_URI;
  if (!client_id || !client_secret || !redirect_uri) {
    throw new Error("Gmail OAuth env vars not set (GMAIL_CLIENT_ID/SECRET/REDIRECT_URI)");
  }
  return { client_id, client_secret, redirect_uri };
}

export function buildAuthUrl(): string {
  const { client_id, redirect_uri } = clientCreds();
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // force a fresh refresh_token every time — needed since Testing-mode tokens expire in 7 days
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const { client_id, client_secret, redirect_uri } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error("No refresh_token in response — Google only issues one on first consent per session; try revoking access at https://myaccount.google.com/permissions and reconnecting.");
  }
  const stored: StoredToken = { refresh_token: data.refresh_token, connected_at: new Date().toISOString() };
  await writeFile(TOKEN_PATH, JSON.stringify(stored, null, 2), "utf-8");
}

async function getStoredToken(): Promise<StoredToken | null> {
  try {
    return JSON.parse(await readFile(TOKEN_PATH, "utf-8")) as StoredToken;
  } catch {
    return null;
  }
}

export async function isConnected(): Promise<boolean> {
  return (await getStoredToken()) !== null;
}

async function getAccessToken(): Promise<string> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("Gmail not connected — visit /api/gmail/oauth/start to connect.");

  const { client_id, client_secret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: stored.refresh_token,
      client_id,
      client_secret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed (likely expired — Testing-mode refresh tokens last 7 days, reconnect via /api/gmail/oauth/start): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function searchEmails(query: string, maxResults = 10): Promise<GmailMessage[]> {
  const accessToken = await getAccessToken();
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
