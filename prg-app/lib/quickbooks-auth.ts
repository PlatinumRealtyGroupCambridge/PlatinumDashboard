import { prisma } from "./prisma";

// Single-row connection — see QuickBooksConnection in prisma/schema.prisma.
const CONNECTION_ID = "singleton";

// Verified against Intuit's discovery document
// (https://developer.api.intuit.com/.well-known/openid_configuration) on
// 2026-07-10 — re-check there if QuickBooks connections ever start failing
// unexpectedly, in case Intuit has changed these.
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
const API_BASE_URL = "https://quickbooks.api.intuit.com";

const SCOPE = "com.intuit.quickbooks.accounting";

// Hardcoded rather than an env var, to keep the number of things Tim has to
// configure in Vercel to a minimum — update this if the production domain
// ever changes (e.g. a custom domain replacing the default *.vercel.app one).
const APP_BASE_URL = "https://platinum-dashboard-psi.vercel.app";
export const QBO_REDIRECT_URI = `${APP_BASE_URL}/api/quickbooks/callback`;

// Thrown when the stored connection can't be repaired automatically (no
// connection yet, or the refresh token itself has expired/been revoked) —
// callers should catch this specifically and point the admin at
// /admin/quickbooks to reconnect, rather than treating it as a transient
// failure worth retrying.
export class QuickBooksReconnectRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickBooksReconnectRequiredError";
  }
}

// Intuit includes an "intuit_tid" header on every response — capturing it
// on failures is what Intuit's own support team asks for when
// troubleshooting a specific request, so it's logged alongside the error
// rather than discarded. These land in Vercel's function logs, which is
// enough logging for an app this size (no separate log service needed).
async function logQuickBooksError(context: string, res: Response) {
  const intuitTid = res.headers.get("intuit_tid");
  const body = await res.text();
  console.error(`QuickBooks API error [${context}] status=${res.status} intuit_tid=${intuitTid ?? "none"} body=${body}`);
  return body;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function basicAuthHeader() {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export function getAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: requireEnv("QBO_CLIENT_ID"),
    redirect_uri: QBO_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until the access token expires (normally 3600)
  x_refresh_token_expires_in: number; // seconds until the refresh token itself expires (normally ~100 days)
};

// A failed token request that includes an OAuth "error" body means the
// grant itself is bad (expired/revoked refresh token, or a stale
// authorization code) — not a transient network hiccup worth retrying.
async function isInvalidGrantResponse(res: Response): Promise<boolean> {
  if (res.status !== 400) return false;
  try {
    const body = await res.clone().json();
    return body?.error === "invalid_grant";
  } catch {
    return false;
  }
}

async function saveTokens(realmId: string, tokens: TokenResponse) {
  const now = Date.now();
  const data = {
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now + tokens.x_refresh_token_expires_in * 1000),
  };
  await prisma.quickBooksConnection.upsert({
    where: { id: CONNECTION_ID },
    update: data,
    create: { id: CONNECTION_ID, ...data },
  });
}

// Called once, right after the admin approves the connection on
// QuickBooks' consent screen (app/api/quickbooks/callback/route.ts).
export async function exchangeCodeForTokens(code: string, realmId: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: QBO_REDIRECT_URI }),
  });
  if (!res.ok) throw new Error(`QuickBooks token exchange failed: ${res.status} ${await logQuickBooksError("exchangeCodeForTokens", res)}`);
  const tokens = (await res.json()) as TokenResponse;
  await saveTokens(realmId, tokens);
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    if (await isInvalidGrantResponse(res)) {
      // The refresh token has expired or been revoked (e.g. disconnected
      // from QuickBooks' side) — this connection can't be repaired by
      // retrying, it needs a human to reconnect. Clear the stale row so
      // /admin/quickbooks correctly shows "not connected" instead of a
      // connection that looks present but silently can't be used.
      await disconnectQuickBooks();
      throw new QuickBooksReconnectRequiredError("QuickBooks connection has expired — please reconnect.");
    }
    throw new Error(`QuickBooks token refresh failed: ${res.status} ${await logQuickBooksError("refreshTokens", res)}`);
  }
  return res.json();
}

// Returns a currently-valid access token + realm (company) id, refreshing
// first if the stored access token is expired or about to be. Throws
// QuickBooksReconnectRequiredError if nothing is connected, or if the
// refresh token itself is no longer valid.
export async function getValidQuickBooksAuth(): Promise<{ accessToken: string; realmId: string }> {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!connection) throw new QuickBooksReconnectRequiredError("QuickBooks is not connected yet.");

  const expiresSoon = connection.accessTokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon) {
    return { accessToken: connection.accessToken, realmId: connection.realmId };
  }

  const refreshed = await refreshTokens(connection.refreshToken);
  await saveTokens(connection.realmId, refreshed);
  return { accessToken: refreshed.access_token, realmId: connection.realmId };
}

// Thin wrapper for calling the QuickBooks Accounting API — handles getting
// a valid token and, if the API rejects it as expired anyway (a token can
// go stale between when we checked it and when this request lands), forces
// one fresh refresh-and-retry rather than failing outright or retrying in
// a loop. See lib/quickbooks.ts for the actual report/query calls built on
// top of this.
export async function fetchQuickBooksApi(path: string, params?: Record<string, string>): Promise<unknown> {
  const attempt = async (forceRefresh: boolean) => {
    if (forceRefresh) {
      const connection = await prisma.quickBooksConnection.findUnique({ where: { id: CONNECTION_ID } });
      if (!connection) throw new QuickBooksReconnectRequiredError("QuickBooks is not connected yet.");
      await refreshTokens(connection.refreshToken).then((tokens) => saveTokens(connection.realmId, tokens));
    }
    const { accessToken, realmId } = await getValidQuickBooksAuth();
    const url = new URL(`${API_BASE_URL}/v3/company/${realmId}/${path}`);
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return res;
  };

  let res = await attempt(false);
  if (res.status === 401) {
    // Access token was rejected even though our stored expiry said it was
    // still good — refresh once for real and retry exactly once more.
    res = await attempt(true);
  }
  if (!res.ok) throw new Error(`QuickBooks API request failed: ${res.status} ${await logQuickBooksError(path, res)}`);
  return res.json();
}

export async function disconnectQuickBooks() {
  await prisma.quickBooksConnection.deleteMany({ where: { id: CONNECTION_ID } });
}

export async function getQuickBooksConnectionStatus() {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { id: CONNECTION_ID } });
  return connection
    ? { connected: true as const, realmId: connection.realmId, connectedAt: connection.createdAt }
    : { connected: false as const };
}
