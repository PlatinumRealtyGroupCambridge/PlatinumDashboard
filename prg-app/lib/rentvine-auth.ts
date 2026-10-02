// Thin auth/fetch layer for Rentvine's Open API
// (https://docs.rentvine.com) — a per-account RESTful API secured with
// HTTP Basic Auth (API Key as username, API Secret as password), unlike
// QuickBooks' OAuth dance in lib/quickbooks-auth.ts. Rentvine's key/secret
// are static (no refresh/rotation), so unlike QuickBooksConnection there's
// no database row — the three values just live as Vercel env vars.
//
// Generated from Rentvine: Settings (⋯ next to your name) > Users, Roles,
// and API > API tab > New API Key. Set as three Vercel env vars:
// RENTVINE_ACCOUNT (the account subdomain, e.g. "platinumrealtygroup"),
// RENTVINE_API_KEY, and RENTVINE_API_SECRET.

const API_VERSION = "manager";

// Thrown when the required env vars aren't set yet — callers should catch
// this specifically and show a "not connected" message (see
// app/api/leasing/summary/route.ts) rather than treating it as a transient
// failure worth retrying.
export class RentvineNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RentvineNotConfiguredError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new RentvineNotConfiguredError(`${name} is not set — Rentvine isn't connected yet.`);
  return value;
}

function baseUrl(): string {
  const account = requireEnv("RENTVINE_ACCOUNT");
  return `https://${account}.rentvine.com/api/${API_VERSION}`;
}

function basicAuthHeader(): string {
  const key = requireEnv("RENTVINE_API_KEY");
  const secret = requireEnv("RENTVINE_API_SECRET");
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function logRentvineError(context: string, res: Response) {
  const body = await res.text();
  console.error(`Rentvine API error [${context}] status=${res.status} body=${body}`);
  return body;
}

// GET against the Rentvine API. Throws RentvineNotConfiguredError if the
// env vars aren't set, or a plain Error (with the response body logged)
// on any other failure.
export async function fetchRentvineApi(path: string, params?: Record<string, string | number>): Promise<unknown> {
  const url = new URL(`${baseUrl()}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { Authorization: basicAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Rentvine API request failed: ${res.status} ${await logRentvineError(path, res)}`);
  return res.json();
}

export function isRentvineConfigured(): boolean {
  return Boolean(process.env.RENTVINE_ACCOUNT && process.env.RENTVINE_API_KEY && process.env.RENTVINE_API_SECRET);
}

// Builds a link into Rentvine's own web app (not the API) — e.g. for
// linking a dashboard row straight through to that record in Rentvine.
export function rentvineAppUrl(path: string): string {
  const account = requireEnv("RENTVINE_ACCOUNT");
  return `https://${account}.rentvine.com${path}`;
}
