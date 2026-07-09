import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { nyTodayISO } from "@/lib/timezone";
import { getOpenWorkOrderStats, getRangeTotals } from "@/lib/maintenance-mock";

// Backs the Maintenance Dashboard (components/MaintenanceDashboard.tsx).
// Currently computes everything from lib/maintenance-mock.ts's fake data —
// once Rentvine/QuickBooks are connected, this route is the only place
// that needs to change; the page and component can stay as-is since they
// just call this same URL shape.
//
// Query params: ?preset=this_month|last_month|ytd|custom, and for
// "custom", &from=YYYY-MM-DD&to=YYYY-MM-DD.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
function startOfMonth(iso: string) {
  const { y, m } = ymd(iso);
  return `${y}-${pad(m)}-01`;
}
function startOfPrevMonth(iso: string) {
  const { y, m } = ymd(iso);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${pad(prevMonth)}-01`;
}
function dayBefore(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function startOfYear(iso: string) {
  const { y } = ymd(iso);
  return `${y}-01-01`;
}

export async function GET(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!viewer.isAdmin && !viewer.allowedSections.includes("maintenance")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const todayISO = nyTodayISO();
  const { searchParams } = new URL(req.url);
  const preset = searchParams.get("preset") ?? "this_month";

  let fromISO: string;
  let toISO: string = todayISO;
  if (preset === "last_month") {
    fromISO = startOfPrevMonth(todayISO);
    toISO = dayBefore(startOfMonth(todayISO));
  } else if (preset === "ytd") {
    fromISO = startOfYear(todayISO);
  } else if (preset === "custom") {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (!fromParam || !toParam || !DATE_RE.test(fromParam) || !DATE_RE.test(toParam)) {
      return NextResponse.json({ error: "Custom range needs valid from/to dates." }, { status: 400 });
    }
    fromISO = fromParam;
    toISO = toParam;
  } else {
    fromISO = startOfMonth(todayISO);
  }

  const dayStats = getOpenWorkOrderStats(todayISO);
  const rangeTotals = getRangeTotals(fromISO, toISO, todayISO);

  return NextResponse.json({ dayStats, rangeTotals, range: { from: fromISO, to: toISO } });
}
