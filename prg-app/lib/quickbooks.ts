import { fetchQuickBooksApi } from "./quickbooks-auth";
import { prisma } from "./prisma";

// Net Labor monthly goal — stored in the existing AppMeta key/value table
// (no dedicated table needed) so admins can change it from
// /maintenance without a deploy. Falls back to $4,000 if never set.
const NET_LABOR_GOAL_KEY = "maintenance_net_labor_goal";
const DEFAULT_NET_LABOR_MONTHLY_GOAL = 4000;

export async function getNetLaborMonthlyGoal(): Promise<number> {
  const row = await prisma.appMeta.findUnique({ where: { key: NET_LABOR_GOAL_KEY } });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_NET_LABOR_MONTHLY_GOAL;
}

export async function setNetLaborMonthlyGoal(value: number): Promise<void> {
  await prisma.appMeta.upsert({
    where: { key: NET_LABOR_GOAL_KEY },
    update: { value: String(value) },
    create: { key: NET_LABOR_GOAL_KEY, value: String(value) },
  });
}

// The 17 real Products & Services that count toward "Total Maintenance
// Labor Billed" (gross, before discounts) — see Tim's spec. Matched
// against QuickBooks line items by exact name.
const LABOR_ITEM_NAMES = new Set([
  "105 - Labor - Property Manager - Business Hours - HOA",
  "106 - Labor - Property Manager - After Hours - HOA",
  "107 - Labor - Property Manager - Sundays & Holidays - HOA",
  "108 - Labor - Property Manager - Emergency Rate - HOA",
  "205 - Labor - Property Manager - Business Hours - RENTAL",
  "206 - Labor - Property Manager - After Hours - RENTAL",
  "207 - Labor - Property Manager - Sundays & Holidays - RENTAL",
  "208 - Labor - Property Manager - Emergency Rate - RENTAL",
  "305 - Labor - Maintenance Tech - Business Hours - HOA",
  "306 - Labor - Maintenance Tech - After Hours - HOA",
  "307 - Labor - Maintenance Tech - Sundays & Holidays - HOA",
  "308 - Labor - Maintenance Tech - Emergency Rate - HOA",
  "309 - Labor - Maintenance Tech - Business Hours - RENTAL",
  "310 - Labor - Maintenance Tech - After Hours - RENTAL",
  "311 - Labor - Maintenance Tech - Sundays & Holidays - RENTAL",
  "312 - Labor - Maintenance Tech - Emergency Rate - RENTAL",
  "313 - Landscape Services",
]);

// Stored as negative $ and hours in QuickBooks — summing them in with the
// gross items above nets them out, per Tim's instruction.
const DISCOUNT_ITEM_NAMES = new Set([
  "501 - Discount - Labor - Maintenance - HOA",
  "502 - Discount - Labor - Maintenance - RENTAL",
]);

const TRIP_CHARGE_ITEM_NAME = "303 - Trip Charge";

// Ledger accounts gas spend is coded to, by their QuickBooks account
// number (the AcctNum field) — NOT by name. Unlike the Products & Services
// above (where the number is typed directly into the item's name, e.g.
// "303 - Trip Charge"), accounts have the number in a separate AcctNum
// field — an account's Name might just be "Maintenance Gas & Mileage
// Reimbursement" with no "6713" in it anywhere, so matching on name text
// silently finds nothing. getGasSpend() below resolves these to real
// account ids first, then matches expense lines by id.
const GAS_ACCOUNT_NUMBERS = ["6113", "6713"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// QuickBooks caps each query response at 1000 rows — this fetches every
// page until a short page signals the end. whereClause is optional since
// not every entity needs (or reliably supports) filtering — e.g. Account
// doesn't allow filtering by AcctNum, so resolveGasAccountIds below fetches
// every account and filters in JS instead.
async function queryAll(entity: string, whereClause?: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let startPosition = 1;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = `SELECT * FROM ${entity}${whereClause ? ` WHERE ${whereClause}` : ""} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const json = (await fetchQuickBooksApi("query", { query })) as {
      QueryResponse?: Record<string, Record<string, unknown>[]>;
    };
    const rows = json.QueryResponse?.[entity] ?? [];
    results.push(...rows);
    if (rows.length < pageSize) break;
    startPosition += pageSize;
  }
  return results;
}

type SalesLine = {
  DetailType?: string;
  Amount?: number;
  SalesItemLineDetail?: { ItemRef?: { name?: string }; Qty?: number };
};

// Sums the 17 labor items, 2 discount items, and Trip Charge item across
// every Invoice and Sales Receipt in the date range. Both transaction
// types share the same line-item shape (SalesItemLineDetail), and a
// discount line typically sits right on the same invoice as the labor
// line it's reducing, so one pass over both transaction types naturally
// captures gross + discount + trip charge together.
export async function getLaborAndTripChargeTotals(fromISO: string, toISO: string) {
  const whereClause = `TxnDate >= '${fromISO}' AND TxnDate <= '${toISO}'`;
  const [invoices, salesReceipts] = await Promise.all([
    queryAll("Invoice", whereClause),
    queryAll("SalesReceipt", whereClause),
  ]);

  let laborBilledGross = 0;
  let laborHoursGross = 0;
  let laborDiscount = 0;
  let laborHoursDiscount = 0;
  let tripChargeRevenue = 0;

  for (const txn of [...invoices, ...salesReceipts]) {
    const lines = (txn.Line as SalesLine[] | undefined) ?? [];
    for (const line of lines) {
      if (line.DetailType !== "SalesItemLineDetail") continue;
      const itemName = line.SalesItemLineDetail?.ItemRef?.name;
      if (!itemName) continue;
      const amount = line.Amount ?? 0;
      const qty = line.SalesItemLineDetail?.Qty ?? 0;

      if (LABOR_ITEM_NAMES.has(itemName)) {
        laborBilledGross += amount;
        laborHoursGross += qty;
      } else if (DISCOUNT_ITEM_NAMES.has(itemName)) {
        laborDiscount += amount;
        laborHoursDiscount += qty;
      } else if (itemName === TRIP_CHARGE_ITEM_NAME) {
        tripChargeRevenue += amount;
      }
    }
  }

  return {
    laborBilledGross: round2(laborBilledGross),
    laborDiscount: round2(laborDiscount),
    laborBilledNet: round2(laborBilledGross + laborDiscount),
    laborHoursGross: round2(laborHoursGross),
    laborHoursDiscount: round2(laborHoursDiscount),
    laborHoursNet: round2(laborHoursGross + laborHoursDiscount),
    tripChargeRevenue: round2(tripChargeRevenue),
  };
}

type SalesTxn = { TxnDate?: string; Line?: SalesLine[] };

function monthKey(txnDate: string): string {
  return txnDate.slice(0, 7); // "YYYY-MM"
}

// The trailing N months (oldest first) as "YYYY-MM" keys, including the
// current in-progress month.
function trailingMonthKeys(todayISO: string, count: number): string[] {
  const { y, m } = ymd(todayISO);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = (y * 12 + (m - 1)) - i;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    keys.push(`${year}-${pad(month)}`);
  }
  return keys;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return { y, m };
}

// One data point per month for the trailing `monthsBack` months (including
// the current month, which will be partial) — net labor billed, trip
// charge revenue, and gas spend, fetched in one set of queries over the
// whole window rather than one query per month. Backs the trend chart on
// the Maintenance Dashboard. The goal line uses the current admin-set
// goal flat across all 12 months (not attempting to reconstruct what the
// goal used to be if it's changed over time).
export async function getMonthlyTrend(todayISO: string, monthsBack = 12) {
  const monthKeys = trailingMonthKeys(todayISO, monthsBack);
  const fromISO = `${monthKeys[0]}-01`;
  const whereClause = `TxnDate >= '${fromISO}' AND TxnDate <= '${todayISO}'`;

  const [invoices, salesReceipts, gasAccountIds, purchases, bills, monthlyGoal] = await Promise.all([
    queryAll("Invoice", whereClause),
    queryAll("SalesReceipt", whereClause),
    resolveGasAccountIds(),
    queryAll("Purchase", whereClause),
    queryAll("Bill", whereClause),
    getNetLaborMonthlyGoal(),
  ]);

  const netLaborByMonth = new Map<string, number>();
  const tripChargeByMonth = new Map<string, number>();
  const gasByMonth = new Map<string, number>();

  for (const txn of [...invoices, ...salesReceipts] as SalesTxn[]) {
    const txnDate = txn.TxnDate;
    if (!txnDate) continue;
    const key = monthKey(txnDate);
    for (const line of txn.Line ?? []) {
      if (line.DetailType !== "SalesItemLineDetail") continue;
      const itemName = line.SalesItemLineDetail?.ItemRef?.name;
      if (!itemName) continue;
      const amount = line.Amount ?? 0;

      if (LABOR_ITEM_NAMES.has(itemName) || DISCOUNT_ITEM_NAMES.has(itemName)) {
        netLaborByMonth.set(key, (netLaborByMonth.get(key) ?? 0) + amount);
      } else if (itemName === TRIP_CHARGE_ITEM_NAME) {
        tripChargeByMonth.set(key, (tripChargeByMonth.get(key) ?? 0) + amount);
      }
    }
  }

  for (const txn of [...purchases, ...bills]) {
    const txnDate = (txn as { TxnDate?: string }).TxnDate;
    if (!txnDate) continue;
    const key = monthKey(txnDate);
    const lines = (txn.Line as ExpenseLine[] | undefined) ?? [];
    for (const line of lines) {
      if (line.DetailType !== "AccountBasedExpenseLineDetail") continue;
      const accountId = line.AccountBasedExpenseLineDetail?.AccountRef?.value;
      if (accountId && gasAccountIds.has(accountId)) {
        gasByMonth.set(key, (gasByMonth.get(key) ?? 0) + (line.Amount ?? 0));
      }
    }
  }

  return monthKeys.map((key) => ({
    month: key,
    netLaborBilled: round2(netLaborByMonth.get(key) ?? 0),
    tripChargeRevenue: round2(tripChargeByMonth.get(key) ?? 0),
    gasSpend: round2(gasByMonth.get(key) ?? 0),
    goal: monthlyGoal,
  }));
}

type ExpenseLine = {
  DetailType?: string;
  Amount?: number;
  AccountBasedExpenseLineDetail?: { AccountRef?: { value?: string; name?: string } };
};

type Account = { Id?: string; AcctNum?: string; Name?: string };

// Resolves GAS_ACCOUNT_NUMBERS to their actual QuickBooks account ids —
// account refs on expense lines carry an id (AccountRef.value), so
// matching by id is what actually works, unlike matching by name text.
// Fetches every account (no WHERE filter) and matches AcctNum in JS,
// rather than filtering via the query language — AcctNum isn't a
// reliably filterable field for Account in QuickBooks' query API, which
// was causing this whole lookup to fail.
async function resolveGasAccountIds(): Promise<Set<string>> {
  const accounts = (await queryAll("Account")) as Account[];
  return new Set(
    accounts.filter((a) => a.AcctNum && GAS_ACCOUNT_NUMBERS.includes(a.AcctNum)).map((a) => a.Id).filter((id): id is string => !!id)
  );
}

// Sums expense lines coded to accounts 6113/6713 across Purchases (card
// swipes, checks, cash expenses) and Bills (vendor invoices) in the date
// range — the two most common ways a gas purchase would be recorded. If
// this number ever looks low compared to Tim's own QuickBooks P&L, it
// likely means gas is also being entered through a transaction type not
// covered here (e.g. a manual Journal Entry) and this list needs expanding.
export async function getGasSpend(fromISO: string, toISO: string): Promise<number> {
  const whereClause = `TxnDate >= '${fromISO}' AND TxnDate <= '${toISO}'`;
  const [gasAccountIds, purchases, bills] = await Promise.all([
    resolveGasAccountIds(),
    queryAll("Purchase", whereClause),
    queryAll("Bill", whereClause),
  ]);

  let total = 0;
  for (const txn of [...purchases, ...bills]) {
    const lines = (txn.Line as ExpenseLine[] | undefined) ?? [];
    for (const line of lines) {
      if (line.DetailType !== "AccountBasedExpenseLineDetail") continue;
      const accountId = line.AccountBasedExpenseLineDetail?.AccountRef?.value;
      if (accountId && gasAccountIds.has(accountId)) {
        total += line.Amount ?? 0;
      }
    }
  }
  return round2(total);
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based; day 0 of "next month" is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The monthly goal, prorated by actual calendar-month overlap rather than
// a flat days-in-range / average-days-per-month ratio — that average
// (30.4368) made a full 30-day month like June come out to ~$3,942
// instead of exactly $4,000, which is wrong: a complete calendar month
// should equal the full goal regardless of whether it has 28, 30, or 31
// days. Sums each touched month's (overlapping days / days in that month).
function goalForRange(fromISO: string, toISO: string, monthlyGoal: number): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);

  let total = 0;
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const dim = daysInMonth(y, m);
    const startDay = y === fy && m === fm ? fd : 1;
    const endDay = y === ty && m === tm ? td : dim;
    total += monthlyGoal * ((endDay - startDay + 1) / dim);

    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return round2(total);
}

export async function getMaintenanceFinancials(fromISO: string, toISO: string) {
  const [laborAndTripCharge, gasSpend, monthlyGoal] = await Promise.all([
    getLaborAndTripChargeTotals(fromISO, toISO),
    getGasSpend(fromISO, toISO),
    getNetLaborMonthlyGoal(),
  ]);
  const goal = goalForRange(fromISO, toISO, monthlyGoal);
  const netLaborGoalPercent = goal > 0 ? round2((laborAndTripCharge.laborBilledNet / goal) * 100) : null;
  const netLaborGoalDelta = round2(laborAndTripCharge.laborBilledNet - goal);
  return { ...laborAndTripCharge, gasSpend, netLaborGoal: goal, netLaborGoalPercent, netLaborGoalDelta };
}
