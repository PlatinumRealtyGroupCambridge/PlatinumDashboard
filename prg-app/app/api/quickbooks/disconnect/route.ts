import { NextRequest, NextResponse } from "next/server";
import { disconnectQuickBooks } from "@/lib/quickbooks-auth";

// QuickBooks can redirect a user's browser here after they disconnect this
// app from within QuickBooks' own "Connected Apps" management screen —
// that can happen without an active session on our side, so this route is
// exempt from the login-required middleware (see middleware.ts). It just
// clears our locally-stored connection; QuickBooks has already revoked the
// token on their end regardless of what we do here, so this is cleanup,
// not something that grants any access.
export async function GET(req: NextRequest) {
  await disconnectQuickBooks();
  return NextResponse.redirect(new URL("/admin/quickbooks?disconnected=1", req.url));
}
