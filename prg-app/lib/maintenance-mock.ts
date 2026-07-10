// Placeholder data for the Maintenance Dashboard until it's wired up to
// Rentvine (work orders) and QuickBooks Online (labor billing, trip
// charges, gas spend) — see app/api/maintenance/summary/route.ts, the only
// place that imports this file. Swapping in real data later means
// replacing getOpenWorkOrderStats/getRangeTotals below with real API
// calls; nothing in the dashboard page or component needs to change.
//
// Numbers come from a fixed random seed so they stay stable across
// requests and page reloads instead of re-randomizing every time —
// otherwise switching the date filter back and forth would show different
// numbers for the same range, which would look broken.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// All dates here are plain calendar-day strings (YYYY-MM-DD), not real
// stored instants, so these helpers work in UTC only — no timezone
// conversion needed, same reasoning as a due-date field elsewhere in the
// app (see lib/timezone.ts's comments on calendar-only fields).
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const HISTORY_DAYS = 420;

type WorkOrder = { id: string; openedAt: string; plannedDurationDays: number; lastUpdatedAt: string };
// Gross labor lines (the 17 real Products & Services) and discount lines
// (the 2 "Discount - Labor - Maintenance" items) are modeled separately,
// mirroring how they'll come back as two different QuickBooks item groups
// once wired up for real — the discount lines carry negative $ and hours,
// same sign convention QuickBooks uses.
type LaborLine = { id: string; date: string; hours: number; billed: number };
type OtherTransaction = { id: string; date: string; tripCharge: number; gasSpend: number };

function buildWorkOrders(todayISO: string): WorkOrder[] {
  const rand = mulberry32(20260709);
  const orders: WorkOrder[] = [];
  for (let i = 0; i < 260; i++) {
    const openedAt = addDays(todayISO, -Math.floor(rand() * HISTORY_DAYS));
    // Most work orders close within a few days; a long tail takes longer —
    // gives "days to close" a realistic distribution instead of a flat average.
    const durationRoll = rand();
    const plannedDurationDays =
      durationRoll < 0.6
        ? 1 + Math.floor(rand() * 3)
        : durationRoll < 0.9
          ? 4 + Math.floor(rand() * 6)
          : 10 + Math.floor(rand() * 12);

    // Most open work orders get touched every day or two; a smaller
    // portion sit stale for a while — that gap is what "needs attention"
    // surfaces. Bounded so a freshly-opened order can't have a "last
    // update" from before it existed.
    const staleRoll = rand();
    const daysSinceUpdate =
      staleRoll < 0.65 ? Math.floor(rand() * 3) : staleRoll < 0.85 ? 3 + Math.floor(rand() * 4) : 7 + Math.floor(rand() * 10);
    const daysSinceOpened = Math.max(0, -daysBetween(todayISO, openedAt));
    const lastUpdatedAt = addDays(todayISO, -Math.min(daysSinceUpdate, daysSinceOpened));

    orders.push({ id: `wo-${i}`, openedAt, plannedDurationDays, lastUpdatedAt });
  }
  return orders;
}

// Stand-in for the 17 real "Labor - Property Manager" / "Labor -
// Maintenance Tech" / "Landscape Services" items — gross, before discounts.
function buildLaborLines(todayISO: string): LaborLine[] {
  const rand = mulberry32(918273645);
  const lines: LaborLine[] = [];
  for (let i = 0; i < 340; i++) {
    const date = addDays(todayISO, -Math.floor(rand() * HISTORY_DAYS));
    const hours = Math.round((0.5 + rand() * 7.5) * 4) / 4; // quarter-hour increments
    const hourlyRate = 58 + rand() * 27; // $58–$85/hr
    const billed = round2(hours * hourlyRate);
    lines.push({ id: `ll-${i}`, date, hours, billed });
  }
  return lines;
}

// Stand-in for "501 - Discount - Labor - Maintenance - HOA" and
// "502 - Discount - Labor - Maintenance - RENTAL" — a smaller, occasional
// set of lines with negative $ and hours, same sign QuickBooks stores them
// with, so summing them alongside the gross lines nets them out correctly.
function buildDiscountLines(todayISO: string): LaborLine[] {
  const rand = mulberry32(357111317);
  const lines: LaborLine[] = [];
  for (let i = 0; i < 55; i++) {
    const date = addDays(todayISO, -Math.floor(rand() * HISTORY_DAYS));
    const hours = -(Math.round((0.25 + rand() * 2) * 4) / 4);
    const billed = -round2(30 + rand() * 220);
    lines.push({ id: `dl-${i}`, date, hours, billed });
  }
  return lines;
}

function buildOtherTransactions(todayISO: string): OtherTransaction[] {
  const rand = mulberry32(482910335);
  const txns: OtherTransaction[] = [];
  for (let i = 0; i < 340; i++) {
    const date = addDays(todayISO, -Math.floor(rand() * HISTORY_DAYS));
    const tripCharge = rand() < 0.7 ? [35, 45, 65][Math.floor(rand() * 3)] : 0;
    const gasSpend = round2(rand() * 14);
    txns.push({ id: `ot-${i}`, date, tripCharge, gasSpend });
  }
  return txns;
}

// The two "tied to today" metrics — not affected by the dashboard's date
// range filter, always reflect the current moment.
export function getOpenWorkOrderStats(todayISO: string) {
  const orders = buildWorkOrders(todayISO);
  let open = 0;
  let needsAttention = 0;
  for (const o of orders) {
    const wouldCloseAt = addDays(o.openedAt, o.plannedDurationDays);
    if (wouldCloseAt > todayISO) {
      open++;
      if (daysBetween(o.lastUpdatedAt, todayISO) >= 3) needsAttention++;
    }
  }
  return { openWorkOrders: open, needsAttention };
}

// The date-range-filterable metrics: average days to close (bucketed by
// each work order's close date, so it moves with the selected range like
// the financial totals below) plus the four labor/cost totals.
export function getRangeTotals(fromISO: string, toISO: string, todayISO: string) {
  const orders = buildWorkOrders(todayISO);
  const closedInRange = orders.filter((o) => {
    const closedAt = addDays(o.openedAt, o.plannedDurationDays);
    return closedAt <= todayISO && closedAt >= fromISO && closedAt <= toISO;
  });
  const avgDaysToClose =
    closedInRange.length > 0
      ? round2(closedInRange.reduce((sum, o) => sum + o.plannedDurationDays, 0) / closedInRange.length)
      : null;

  const laborLines = buildLaborLines(todayISO).filter((l) => l.date >= fromISO && l.date <= toISO);
  const discountLines = buildDiscountLines(todayISO).filter((l) => l.date >= fromISO && l.date <= toISO);
  const laborBilledGross = round2(laborLines.reduce((sum, l) => sum + l.billed, 0));
  const laborDiscount = round2(discountLines.reduce((sum, l) => sum + l.billed, 0));
  const laborHoursGross = round2(laborLines.reduce((sum, l) => sum + l.hours, 0));
  const laborHoursDiscount = round2(discountLines.reduce((sum, l) => sum + l.hours, 0));

  const otherTxns = buildOtherTransactions(todayISO).filter((t) => t.date >= fromISO && t.date <= toISO);

  return {
    avgDaysToClose,
    laborBilledGross,
    laborDiscount,
    laborBilledNet: round2(laborBilledGross + laborDiscount),
    laborHoursGross,
    laborHoursDiscount,
    laborHoursNet: round2(laborHoursGross + laborHoursDiscount),
    tripChargeRevenue: round2(otherTxns.reduce((sum, t) => sum + t.tripCharge, 0)),
    gasSpend: round2(otherTxns.reduce((sum, t) => sum + t.gasSpend, 0)),
  };
}
