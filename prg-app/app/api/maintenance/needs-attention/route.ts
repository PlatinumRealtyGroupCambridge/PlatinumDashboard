import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { nyTodayISO } from "@/lib/timezone";
import { getNeedsAttentionWorkOrders } from "@/lib/rentvine";
import { RentvineNotConfiguredError } from "@/lib/rentvine-auth";

// Backs the "needs attention" KPI's click-through list on the Maintenance
// Dashboard — fetched lazily (only when that tile is clicked) rather than
// bundled into the summary endpoint, since most page loads never need it.
export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!viewer.isAdmin && !viewer.allowedSections.includes("maintenance")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const { workOrders, rawSample } = await getNeedsAttentionWorkOrders(nyTodayISO());
    // rawSample is only ever set when workOrders comes back empty — only
    // worth showing to an admin, so a mismatch is debuggable directly on
    // the page instead of needing someone to go dig through Vercel's logs.
    return NextResponse.json({ workOrders, rawSample: viewer.isAdmin ? rawSample : undefined });
  } catch (err) {
    const error =
      err instanceof RentvineNotConfiguredError
        ? "Rentvine isn't connected yet — an admin needs to add the Rentvine API key."
        : "Couldn't load this list from Rentvine right now — please try again in a moment.";
    if (!(err instanceof RentvineNotConfiguredError)) {
      console.error("Maintenance dashboard: needs-attention list failed", err);
    }
    return NextResponse.json({ error }, { status: 200 });
  }
}
