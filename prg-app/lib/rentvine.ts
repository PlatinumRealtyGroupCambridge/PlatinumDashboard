import { fetchRentvineApi } from "./rentvine-auth";

// Work-order metrics for the Maintenance Dashboard, pulled live from
// Rentvine's "Work Order" report. The endpoint path and query shape below
// (/reports/work-order?exportTypeID=1&json=...&orientation=2&showHeader=true)
// were copied verbatim from a real "Download as JSON" link Rentvine
// generated for this exact report against Platinum's own account, rather
// than guessed from docs.rentvine.com (which is login-gated — see
// lib/leasing.ts for the earlier, never-verified attempt that left). The
// response envelope itself wasn't independently confirmed, so
// parseReportRows() below accepts a few plausible shapes rather than
// assuming one.

type ReportFilter = Record<string, unknown>;
type ReportRow = Record<string, unknown>;

function parseReportRows(raw: unknown): ReportRow[] {
  if (Array.isArray(raw)) return raw as ReportRow[];
  const obj = raw as { data?: unknown; results?: unknown; rows?: unknown } | null;
  const candidate = obj?.data ?? obj?.results ?? obj?.rows;
  return Array.isArray(candidate) ? (candidate as ReportRow[]) : [];
}

async function runWorkOrderReport(displayColumns: string[], filters: ReportFilter[]): Promise<ReportRow[]> {
  const json = JSON.stringify({ displayColumns, filters });
  const raw = await fetchRentvineApi("/reports/work-order", {
    exportTypeID: 1,
    orientation: 2,
    showHeader: "true",
    json,
  });
  return parseReportRows(raw);
}

// Rentvine's "Primary Work Order Status" groups its ~12 custom pipeline
// statuses into five buckets: 1=Pending, 2=Open, 3=Closed, 4=On Hold,
// 5=Cancelled (confirmed via the Work Order report's filter metadata).
// "Open" for dashboard purposes is anything not Closed or Cancelled.
const OPEN_PRIMARY_STATUSES = ["1", "2", "4"];
const CLOSED_PRIMARY_STATUS = "3";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfNextMonth(iso: string): string {
  const { y, m } = ymd(iso);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
}
function lastDayOfMonth(iso: string): string {
  return addDays(startOfNextMonth(iso), -1);
}
// First day of the month `months` calendar-months before the month
// containing `iso`.
function startOfMonthMinus(iso: string, months: number): string {
  const { y, m } = ymd(iso);
  const index = y * 12 + (m - 1) - months;
  const newY = Math.floor(index / 12);
  const newM = (index % 12) + 1;
  return `${newY}-${pad(newM)}-01`;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

// The four "tied to today" metrics — not affected by the dashboard's date
// range filter, always reflect the current moment. Pending/Open/On Hold
// are Rentvine's own three non-closed primary statuses, split out as
// separate KPIs (rather than one combined "open" count) so this matches
// what Tim sees broken out in Rentvine's own dashboard. "Needs attention"
// stays a single combined metric across all three — an open work order
// (in any of those three statuses) with no status/note update logged in
// 3+ days (Tim's definition — explicitly open AND stale, not just stale).
export async function getOpenWorkOrderStats(todayISO: string): Promise<{
  pendingWorkOrders: number;
  openWorkOrders: number;
  onHoldWorkOrders: number;
  needsAttention: number;
}> {
  const statusFilter = (statusId: string): ReportFilter => ({
    name: "primaryWorkOrderStatusID",
    comparator: "equals",
    value: statusId,
  });
  const [pendingRows, openRows, onHoldRows, staleRows] = await Promise.all([
    runWorkOrderReport(["workOrderNumber"], [statusFilter("1")]),
    runWorkOrderReport(["workOrderNumber"], [statusFilter("2")]),
    runWorkOrderReport(["workOrderNumber"], [statusFilter("4")]),
    runWorkOrderReport(["workOrderNumber"], [
      { name: "primaryWorkOrderStatusID", comparator: "in", values: OPEN_PRIMARY_STATUSES },
      { name: "dateTimeModified", comparator: "onOrBeforeDateRange", endDate: addDays(todayISO, -3) },
    ]),
  ]);
  return {
    pendingWorkOrders: pendingRows.length,
    openWorkOrders: openRows.length,
    onHoldWorkOrders: onHoldRows.length,
    needsAttention: staleRows.length,
  };
}

// Average days between opening and closing, across every work order
// closed in the trailing 12 months ending on the last day of whichever
// month `asOfISO` falls in — always a full calendar-month window, same
// reasoning as the Net Labor goal elsewhere on this dashboard: viewing
// "This month" on the 2nd shouldn't shrink the window to 2 days, it
// should anchor on that month's end.
export async function getAvgDaysToClose12Month(asOfISO: string): Promise<number | null> {
  const windowEnd = lastDayOfMonth(asOfISO);
  const windowStart = startOfMonthMinus(windowEnd, 11);
  const rows = await runWorkOrderReport(
    ["daysOpen"],
    [
      { name: "primaryWorkOrderStatusID", comparator: "equals", value: CLOSED_PRIMARY_STATUS },
      { name: "dateClosed", comparator: "betweenDate", startDate: windowStart, endDate: windowEnd },
    ]
  );
  const days = rows.map((r) => num(r.daysOpen)).filter((n): n is number => n != null);
  if (days.length === 0) return null;
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 100) / 100;
}
