import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentViewer } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/quickbooks-auth";

const STATE_COOKIE = "qbo_oauth_state";

// QuickBooks redirects the admin's browser back here after they approve
// (or cancel) the connection on Intuit's consent screen. Same browser
// session, so our login cookie is still present (a top-level redirect like
// this carries a SameSite=Lax cookie) — if it's somehow not, we bail out
// rather than trust an unauthenticated request to store real credentials.
export async function GET(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !realmId || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/admin/quickbooks?error=1", req.url));
  }

  try {
    await exchangeCodeForTokens(code, realmId);
  } catch {
    return NextResponse.redirect(new URL("/admin/quickbooks?error=1", req.url));
  }

  return NextResponse.redirect(new URL("/admin/quickbooks?connected=1", req.url));
}
