import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "prg_session";

// Middleware runs on Vercel's Edge runtime, which does not support Node's
// built-in `crypto` module (createHash, etc.) — only the standard Web
// Crypto API (`crypto.subtle`, available as a global). This computes the
// same SHA-256 hex digest as lib/auth.ts's Node-based version (both hash
// the same UTF-8 bytes with the same algorithm, so the two stay in sync).
async function expectedSessionToken() {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  const password = process.env.SITE_PASSWORD || "";
  const data = new TextEncoder().encode(`${secret}:${password}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login page itself and its API route, plus Next.js
  // internals and static assets (logo images, favicon) referenced by the
  // login page or by the browser before a session exists.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (token && token === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
