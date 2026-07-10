import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { getNetLaborMonthlyGoal, setNetLaborMonthlyGoal } from "@/lib/quickbooks";

// Admin-only read/write for the Net Labor monthly goal (stored in AppMeta,
// see lib/quickbooks.ts). Non-admins still see the goal's effect on the
// dashboard tiles via /api/maintenance/summary, they just can't change it
// here.
export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const goal = await getNetLaborMonthlyGoal();
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
  await setNetLaborMonthlyGoal(goal);
  return NextResponse.json({ goal });
}
