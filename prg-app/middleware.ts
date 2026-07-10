import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "prg_session";

// Middleware runs on Vercel's Edge runtime, which does not support Node's
// built-in `crypto` module (createHmac, etc.) — only the standard Web
// Crypto API (`crypto.subtle`, available as a global). This verifies the
// same HMAC signature format lib/auth.ts's Node-based signPayload()
// produces (both sign the same UTF-8 payload with the same secret), so the
// two stay in sync. If you change the cookie format in lib/auth.ts, update
// this copy too.
async function hmacHex(secret: string, payload: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// This only checks that the cookie is a validly-signed session (i.e. was
// issued by this server at some point) — it can't check the database from
// the Edge runtime, so it doesn't know whether the account still exists or
// whether a password reset has since invalidated it. That deeper check
// happens in lib/auth.ts's getCurrentViewer(), called by every page's
// Server Component, which does hit the database. This middleware is just a
// cheap first gate that keeps logged-out visitors off every route without
// each page needing its own redirect boilerplate.
async function hasValidSessionCookie(req: NextRequest) {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [userId, versionStr, issuedAtStr, sig] = parts;
  if (!userId || !versionStr || !issuedAtStr || !sig) return false;
  const secret = process.env.SESSION_SECRET || "dev-secret";
  const expected = await hmacHex(secret, `${userId}.${versionStr}.${issuedAtStr}`);
  return sig === expected;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login page itself and its API route, Next.js
  // internals and static assets (logo images, favicon) referenced by the
  // login page or by the browser before a session exists, the Google
  // Chat webhook — Google's servers can't carry our session cookie, so
  // that route authenticates each request itself (a signed token from
  // Google, verified in lib/google-chat-auth.ts) instead of relying on
  // this cookie check — and the Privacy Policy / Terms of Use pages,
  // which QuickBooks' app-review checklist needs to load publicly (see
  // app/privacy, app/terms).
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/google-chat") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (await hasValidSessionCookie(req)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
