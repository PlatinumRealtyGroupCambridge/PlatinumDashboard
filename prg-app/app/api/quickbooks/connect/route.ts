import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getCurrentViewer } from "@/lib/auth";
import { getAuthorizationUrl } from "@/lib/quickbooks-auth";

const STATE_COOKIE = "qbo_oauth_state";

// Admin clicks "Connect to QuickBooks" (or "Reconnect") on
// /admin/quickbooks, which links here. Generates a random CSRF-protection
// value, stores it in a short-lived cookie, and sends the browser to
// QuickBooks' consent screen — app/api/quickbooks/callback/route.ts checks
// this same value comes back before trusting the response.
export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getAuthorizationUrl(state));
}
