import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { getLandscapingMonthlyGoal, setLandscapingMonthlyGoal } from "@/lib/quickbooks";

// Admin-only read/write for the Landscaping monthly goal (stored in
// AppMeta, see lib/quickbooks.ts) — mirrors /api/maintenance/goal (the
// Net Labor goal route). Non-admins still see the goal's effect on the
// dashboard tiles via /api/maintenance/summary, they just can't change it
// here.
export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const goal = await getLandscapingMonthlyGoal();
  return NextResponse.json({ goal });
}

export async function PATCH(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const goal = Number(body?.goal);
  if (!Number.isFinite(goal) || goal <= 0) {
    return NextResponse.json({ error: "Goal must be a positive number." }, { status: 400 });
  }
  await setLandscapingMonthlyGoal(goal);
  return NextResponse.json({ goal });
}
