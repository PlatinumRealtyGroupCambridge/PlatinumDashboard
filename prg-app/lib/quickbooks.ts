import { fetchQuickBooksApi } from "./quickbooks-auth";

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
// page for a given date range until a short page signals the end.
async function queryAll(entity: string, whereClause: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let startPosition = 1;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = `SELECT * FROM ${entity} WHERE ${whereClause} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
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

type ExpenseLine = {
  DetailType?: string;
  Amount?: number;
  AccountBasedExpenseLineDetail?: { AccountRef?: { value?: string; name?: string } };
};

type Account = { Id?: string; AcctNum?: string; Name?: string };

// Resolves GAS_ACCOUNT_NUMBERS to their actual QuickBooks account ids —
// account refs on expense lines carry an id (AccountRef.value), so
// matching by id is what actually works, unlike matching by name text.
async function resolveGasAccountIds(): Promise<Set<string>> {
  const filter = GAS_ACCOUNT_NUMBERS.map((num) => `AcctNum = '${num}'`).join(" OR ");
  const accounts = (await queryAll("Account", filter)) as Account[];
  return new Set(accounts.map((a) => a.Id).filter((id): id is string => !!id));
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

export async function getMaintenanceFinancials(fromISO: string, toISO: string) {
  const [laborAndTripCharge, gasSpend] = await Promise.all([
    getLaborAndTripChargeTotals(fromISO, toISO),
    getGasSpend(fromISO, toISO),
  ]);
  return { ...laborAndTripCharge, gasSpend };
}
