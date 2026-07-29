import { readFile, writeFile } from "fs/promises";
import path from "path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface StoredToken {
  refresh_token: string;
  connected_at: string;
}

export interface GoogleConnector {
  tokenFile: string; // e.g. ".gmail-token.json"
  scope: string; // e.g. "https://www.googleapis.com/auth/gmail.readonly"
  redirectUriEnvVar: string; // e.g. "GMAIL_REDIRECT_URI"
  connectPath: string; // e.g. "/api/gmail/oauth/start" — used in "not connected" error messages
}

function clientCreds(connector: GoogleConnector) {
  const client_id = process.env.GMAIL_CLIENT_ID; // shared across all Google connectors — same OAuth client, different scopes
  const client_secret = process.env.GMAIL_CLIENT_SECRET;
  const redirect_uri = process.env[connector.redirectUriEnvVar];
  if (!client_id || !client_secret || !redirect_uri) {
    throw new Error(`Google OAuth env vars not set (GMAIL_CLIENT_ID/SECRET/${connector.redirectUriEnvVar})`);
  }
  return { client_id, client_secret, redirect_uri };
}

export function buildAuthUrl(connector: GoogleConnector): string {
  const { client_id, redirect_uri } = clientCreds(connector);
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // force a fresh refresh_token every time — needed since Testing-mode tokens expire in 7 days
    scope: connector.scope,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForToken(connector: GoogleConnector, code: string): Promise<void> {
  const { client_id, client_secret, redirect_uri } = clientCreds(connector);
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
  const tokenPath = path.join(process.cwd(), connector.tokenFile);
  await writeFile(tokenPath, JSON.stringify(stored, null, 2), "utf-8");
}

async function getStoredToken(connector: GoogleConnector): Promise<StoredToken | null> {
  try {
    const tokenPath = path.join(process.cwd(), connector.tokenFile);
    return JSON.parse(await readFile(tokenPath, "utf-8")) as StoredToken;
  } catch {
    return null;
  }
}

export async function isConnected(connector: GoogleConnector): Promise<boolean> {
  return (await getStoredToken(connector)) !== null;
}

export async function getAccessToken(connector: GoogleConnector): Promise<string> {
  const stored = await getStoredToken(connector);
  if (!stored) throw new Error(`Not connected — visit ${connector.connectPath} to connect.`);

  const { client_id, client_secret } = clientCreds(connector);
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
    throw new Error(`Token refresh failed (likely expired — Testing-mode refresh tokens last 7 days, reconnect via ${connector.connectPath}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
