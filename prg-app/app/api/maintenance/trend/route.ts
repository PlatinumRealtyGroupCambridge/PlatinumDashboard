import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { nyTodayISO } from "@/lib/timezone";
import { getMonthlyTrend } from "@/lib/quickbooks";
import { QuickBooksReconnectRequiredError } from "@/lib/quickbooks-auth";

// Backs the trend chart on the Maintenance Dashboard — always the trailing
// 12 months, independent of the summary card's date-range filter, so it's
// its own endpoint fetched once rather than re-fetched on every filter
// change.
export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!viewer.isAdmin && !viewer.allowedSections.includes("maintenance")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const trend = await getMonthlyTrend(nyTodayISO(), 12);
    return NextResponse.json({ trend });
  } catch (err) {
    const error =
      err instanceof QuickBooksReconnectRequiredError
        ? "QuickBooks isn't connected — an admin needs to reconnect it on the QuickBooks Connection page."
        : "Couldn't load QuickBooks trend data right now.";
    if (!(err instanceof QuickBooksReconnectRequiredError)) {
      console.error("Maintenance dashboard: trend fetch failed", err);
    }
    return NextResponse.json({ trend: null, error }, { status: 200 });
  }
}
