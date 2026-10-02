import { fetchRentvineApi, rentvineAppUrl } from "./rentvine-auth";

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

// Confirmed via a real raw response (captured through the app's own
// admin diagnostic after the field-access bug this replaces): each row in
// the JSON export comes wrapped as { rowTypeID, data: {...named fields} }
// rather than being the flat field object itself — and that `data` object
// carries a full fixed baseline of fields (workOrderID, propertyAddress,
// unitAddress, daysOpen, etc.) regardless of what displayColumns asked
// for, all as strings even for numeric-looking values. Still tolerant of
// a flatter shape or positional array, in case that ever changes.
function normalizeRow(row: unknown, displayColumns: string[]): ReportRow | null {
  if (row == null) return null;
  if (Array.isArray(row)) {
    const obj: ReportRow = {};
    displayColumns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }
  if (typeof row === "object") {
    const r = row as Record<string, unknown>;
    if (r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
      return r.data as ReportRow;
    }
    return r;
  }
  return null;
}

function parseReportRows(raw: unknown, displayColumns: string[]): ReportRow[] {
  const rawRows: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? ((raw as { data: unknown[] }).data)
      : Array.isArray((raw as { results?: unknown })?.results)
        ? ((raw as { results: unknown[] }).results)
        : Array.isArray((raw as { rows?: unknown })?.rows)
          ? ((raw as { rows: unknown[] }).rows)
          : [];
  return rawRows
    .map((row) => normalizeRow(row, displayColumns))
    .filter((r): r is ReportRow => r != null);
}

// Returns both the parsed rows and a sample of the untouched raw response
// — the response envelope isn't independently documented, so when parsing
// yields nothing, callers can surface rawSample directly (e.g. to an admin
// viewing the page) instead of the mismatch only being visible in Vercel's
// server logs, which nobody was able to check last time this broke.
// Works against any of Rentvine's report routes (work-order, unit, ...),
// not just work orders.
async function runReport(
  route: string,
  displayColumns: string[],
  filters: ReportFilter[]
): Promise<{ rows: ReportRow[]; rawSample: string }> {
  const json = JSON.stringify({ displayColumns, filters });
  const raw = await fetchRentvineApi(`/reports/${route}`, {
    exportTypeID: 1,
    orientation: 2,
    showHeader: "true",
    json,
  });
  const rows = parseReportRows(raw, displayColumns);
  const rawSample = JSON.stringify(raw, null, 2).slice(0, 4000);
  if (rows.length === 0) {
    console.error(`Rentvine ${route} report returned 0 parsed rows — raw response sample:`, rawSample);
  }
  return { rows, rawSample };
}

async function runWorkOrderReport(
  displayColumns: string[],
  filters: ReportFilter[]
): Promise<{ rows: ReportRow[]; rawSample: string }> {
  return runReport("work-order", displayColumns, filters);
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
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// A tag field can hold more than one tag name, comma-separated (e.g.
// "Exclude, VIP") — matches any of them case-insensitively rather than
// requiring an exact single-tag value.
function hasExcludeTag(value: unknown): boolean {
  return typeof value === "string" && value.split(",").some((part) => part.trim().toLowerCase() === "exclude");
}

// Properties/units tagged "Exclude" in Rentvine — their work orders are
// left off the needs-attention list. Confirmed via the Unit report's
// propertyTagDetail/unitTagDetail columns (plain readable tag text,
// unlike the Property report's own tagID filter, which has no equivalent
// readable column). Portfolio-level "Exclude" tags aren't handled here —
// the Portfolio report exposes a tagID filter but no readable tag-name
// column was found to resolve it against, so there's currently no
// reliable way to look that up.
async function getExcludedPropertyAndUnitIds(): Promise<{ propertyIds: Set<number>; unitIds: Set<number> }> {
  const { rows } = await runReport("unit", ["propertyID", "unitID", "propertyTagDetail", "unitTagDetail"], []);
  const propertyIds = new Set<number>();
  const unitIds = new Set<number>();
  for (const r of rows) {
    const propertyId = num(r.propertyID);
    const unitId = num(r.unitID);
    if (propertyId != null && hasExcludeTag(r.propertyTagDetail)) propertyIds.add(propertyId);
    if (unitId != null && hasExcludeTag(r.unitTagDetail)) unitIds.add(unitId);
  }
  return { propertyIds, unitIds };
}

function isExcludedRow(r: ReportRow, excluded: { propertyIds: Set<number>; unitIds: Set<number> }): boolean {
  const propertyId = num(r.propertyID);
  const unitId = num(r.unitID);
  return (propertyId != null && excluded.propertyIds.has(propertyId)) || (unitId != null && excluded.unitIds.has(unitId));
}

export type NeedsAttentionWorkOrder = {
  workOrderNumber: number;
  rentvineUrl: string;
  property: string | null;
  unit: string | null;
  description: string;
  status: string | null;
  lastUpdated: string | null;
  daysSinceUpdate: number | null;
};

// The actual work orders behind the "needs attention" count — same filter
// as getOpenWorkOrderStats' staleRows, with enough detail to show a
// useful list and a direct link to each one in Rentvine. Sorting is left
// to the frontend (it fetches the whole list anyway); stalest-first here
// is just a sane default order. rawSample is only populated when the
// list comes out empty, as a diagnostic for an admin to inspect directly
// on the page.
export async function getNeedsAttentionWorkOrders(
  todayISO: string
): Promise<{ workOrders: NeedsAttentionWorkOrder[]; rawSample?: string }> {
  const [{ rows, rawSample }, excluded] = await Promise.all([
    runWorkOrderReport(
      ["workOrderNumber", "propertyID", "unitID", "description", "dateTimeModified"],
      [
        { name: "primaryWorkOrderStatusID", comparator: "in", values: OPEN_PRIMARY_STATUSES },
        { name: "dateTimeModified", comparator: "onOrBeforeDateRange", endDate: addDays(todayISO, -3) },
      ]
    ),
    getExcludedPropertyAndUnitIds(),
  ]);
  const workOrders = rows
    .map((r): NeedsAttentionWorkOrder | null => {
      // propertyName/unitName (what was originally requested) come back
      // null on this report — propertyAddress/unitAddress2 are part of
      // the fixed baseline every row carries regardless of requested
      // columns, and are actually populated, so those are used instead.
      // workOrderStatusName is the specific pipeline status (e.g.
      // "Requested", "Scheduled", "Vendor Completed") rather than just
      // the Pending/Open/On Hold bucket used to filter this list.
      const workOrderId = num(r.workOrderID);
      const workOrderNumber = num(r.workOrderNumber);
      if (workOrderId == null || workOrderNumber == null) return null;
      if (isExcludedRow(r, excluded)) return null;
      const lastUpdated = str(r.dateTimeModified) ?? null;
      return {
        workOrderNumber,
        rentvineUrl: rentvineAppUrl(`/maintenance/work-orders/${workOrderId}`),
        property: str(r.propertyAddress) ?? null,
        unit: str(r.unitAddress2) ?? null,
        description: str(r.description) ?? "(no description)",
        status: str(r.workOrderStatusName) ?? null,
        lastUpdated,
        daysSinceUpdate: lastUpdated ? daysBetween(lastUpdated.slice(0, 10), todayISO) : null,
      };
    })
    .filter((r): r is NeedsAttentionWorkOrder => r != null);
  workOrders.sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0));
  return workOrders.length === 0 ? { workOrders, rawSample } : { workOrders };
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
  const idColumns = ["workOrderNumber", "propertyID", "unitID"];
  const [pending, open, onHold, stale, excluded] = await Promise.all([
    runWorkOrderReport(idColumns, [statusFilter("1")]),
    runWorkOrderReport(idColumns, [statusFilter("2")]),
    runWorkOrderReport(idColumns, [statusFilter("4")]),
    runWorkOrderReport(idColumns, [
      { name: "primaryWorkOrderStatusID", comparator: "in", values: OPEN_PRIMARY_STATUSES },
      { name: "dateTimeModified", comparator: "onOrBeforeDateRange", endDate: addDays(todayISO, -3) },
    ]),
    getExcludedPropertyAndUnitIds(),
  ]);
  const countNonExcluded = (rows: ReportRow[]) => rows.filter((r) => !isExcludedRow(r, excluded)).length;
  return {
    pendingWorkOrders: countNonExcluded(pending.rows),
    openWorkOrders: countNonExcluded(open.rows),
    onHoldWorkOrders: countNonExcluded(onHold.rows),
    needsAttention: countNonExcluded(stale.rows),
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
  const { rows } = await runWorkOrderReport(
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
