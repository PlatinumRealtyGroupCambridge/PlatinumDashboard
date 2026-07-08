import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const SESSION_COOKIE = "prg_session";

function expectedSessionToken() {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  const password = process.env.SITE_PASSWORD || "";
  return createHash("sha256").update(`${secret}:${password}`).digest("hex");
}

export function middleware(req: NextRequest) {
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
  if (token && token === expectedSessionToken()) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
