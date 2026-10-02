"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatHours } from "@/lib/format";
import MaintenanceTrendChart from "./MaintenanceTrendChart";

type TrendPoint = {
  month: string;
  netLaborBilled: number;
  tripChargeRevenue: number;
  gasSpend: number;
  landscapingRevenue: number;
  goal: number;
  landscapingGoal: number;
};

type DayStats = { pendingWorkOrders: number; openWorkOrders: number; onHoldWorkOrders: number; needsAttention: number };
type NeedsAttentionWorkOrder = {
  workOrderNumber: number;
  rentvineUrl: string;
  propertyCode: string | null;
  unitCode: string | null;
  description: string;
  lastUpdated: string | null;
};
type RangeTotals = {
  laborBilledGross: number;
  laborDiscount: number;
  laborBilledNet: number;
  laborHoursGross: number;
  laborHoursDiscount: number;
  laborHoursNet: number;
  tripChargeRevenue: number;
  landscapingRevenue: number;
  gasSpend: number;
  netLaborGoal: number;
  netLaborGoalPercent: number | null;
  netLaborGoalDelta: number;
  landscapingGoal: number | null;
  landscapingGoalPercent: number | null;
  landscapingGoalDelta: number | null;
};
type Preset = "this_month" | "last_month" | "ytd" | "custom";

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-muted)",
        margin: "18px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

// Every metric's line-item/account makeup, shown as a hover tooltip on its
// tile — see lib/quickbooks.ts for the actual matching logic these
// descriptions summarize.
const LABOR_ITEMS_TEXT =
  "105/205 Property Manager – Business Hours, 106/206 – After Hours, 107/207 – Sundays & Holidays, 108/208 – Emergency Rate; 305/309 Maintenance Tech – Business Hours, 306/310 – After Hours, 307/311 – Sundays & Holidays, 308/312 – Emergency Rate (HOA/Rental pairs). Landscaping is tracked separately.";
const DISCOUNT_ITEMS_TEXT =
  "501 - Discount - Labor - Maintenance - HOA and 502 - Discount - Labor - Maintenance - RENTAL (stored as negative amounts in QuickBooks).";

function StatTile({
  label,
  value,
  calculation,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  calculation: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="stat-tile"
      title={`Calculation: ${calculation}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <div className="label">{label}{onClick ? " ▾" : ""}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESET_LABELS: Record<Exclude<Preset, "custom">, string> = {
  this_month: "This month",
  last_month: "Last month",
  ytd: "Year to date",
};

export default function MaintenanceDashboard({
  label,
  blurb,
  isAdmin,
}: {
  label: string;
  blurb: string;
  isAdmin: boolean;
}) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(todayInput());
  const [to, setTo] = useState(todayInput());
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [avgDaysToClose, setAvgDaysToClose] = useState<number | null>(null);
  const [rentvineError, setRentvineError] = useState<string | null>(null);
  const [rangeTotals, setRangeTotals] = useState<RangeTotals | null>(null);
  const [financialsError, setFinancialsError] = useState<string | null>(null);
  const [rangeShown, setRangeShown] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [landscapingMonthlyGoal, setLandscapingMonthlyGoal] = useState<number | null>(null);
  const [editingLandscapingGoal, setEditingLandscapingGoal] = useState(false);
  const [landscapingGoalInput, setLandscapingGoalInput] = useState("");
  const [savingLandscapingGoal, setSavingLandscapingGoal] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [needsAttentionOpen, setNeedsAttentionOpen] = useState(false);
  const [needsAttentionList, setNeedsAttentionList] = useState<NeedsAttentionWorkOrder[] | null>(null);
  const [needsAttentionLoading, setNeedsAttentionLoading] = useState(false);
  const [needsAttentionError, setNeedsAttentionError] = useState<string | null>(null);

  // The click-through list is "as of today" data, same as dayStats, so a
  // refresh triggered elsewhere on the page (e.g. saving a goal) should
  // invalidate the cached list rather than show something stale next time
  // it's reopened.
  useEffect(() => {
    setNeedsAttentionList(null);
    setNeedsAttentionOpen(false);
  }, [refreshNonce]);

  function toggleNeedsAttention() {
    const opening = !needsAttentionOpen;
    setNeedsAttentionOpen(opening);
    if (!opening || needsAttentionList != null) return;
    setNeedsAttentionLoading(true);
    setNeedsAttentionError(null);
    fetch("/api/maintenance/needs-attention")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json?.error || "Failed to load the list.");
        setNeedsAttentionList(json.workOrders);
      })
      .catch((err) => setNeedsAttentionError(err instanceof Error ? err.message : "Failed to load the list."))
      .finally(() => setNeedsAttentionLoading(false));
  }

  // Admin-only: the raw monthly goal figures (not the prorated per-range
  // values shown in the tiles below), fetched once for the edit controls.
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/maintenance/goal")
      .then((res) => res.json())
      .then((json) => {
        if (typeof json.goal === "number") setMonthlyGoal(json.goal);
      })
      .catch(() => {});
    fetch("/api/maintenance/landscaping-goal")
      .then((res) => res.json())
      .then((json) => {
        if (typeof json.goal === "number") setLandscapingMonthlyGoal(json.goal);
      })
      .catch(() => {});
  }, [isAdmin]);

  async function saveGoal() {
    const value = Number(goalInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSavingGoal(true);
    try {
      const res = await fetch("/api/maintenance/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: value }),
      });
      const json = await res.json();
      if (res.ok && typeof json.goal === "number") {
        setMonthlyGoal(json.goal);
        setEditingGoal(false);
        // Re-fetch the summary so the tiles reflect the new goal right away.
        setRefreshNonce((n) => n + 1);
      }
    } finally {
      setSavingGoal(false);
    }
  }

  async function saveLandscapingGoal() {
    const value = Number(landscapingGoalInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSavingLandscapingGoal(true);
    try {
      const res = await fetch("/api/maintenance/landscaping-goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: value }),
      });
      const json = await res.json();
      if (res.ok && typeof json.goal === "number") {
        setLandscapingMonthlyGoal(json.goal);
        setEditingLandscapingGoal(false);
        setRefreshNonce((n) => n + 1);
      }
    } finally {
      setSavingLandscapingGoal(false);
    }
  }

  // Trailing-12-month trend is independent of the date-range filter above,
  // so it's fetched once (and again after a goal edit, via refreshNonce)
  // rather than on every preset/date change.
  useEffect(() => {
    fetch("/api/maintenance/trend")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load trend data.");
        if (json.trend) setTrend(json.trend);
        else setTrendError(json.error ?? "Couldn't load trend data.");
      })
      .catch((err) => setTrendError(err instanceof Error ? err.message : "Failed to load trend data."));
  }, [refreshNonce]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (preset === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    setLoading(true);
    setError(null);
    fetch(`/api/maintenance/summary?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load maintenance stats.");
        setDayStats(json.dayStats);
        setAvgDaysToClose(json.avgDaysToClose ?? null);
        setRentvineError(json.rentvineError ?? null);
        setRangeTotals(json.rangeTotals);
        setFinancialsError(json.financialsError ?? null);
        setRangeShown(json.range);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load maintenance stats."))
      .finally(() => setLoading(false));
  }, [preset, from, to, refreshNonce]);

  return (
    <div>
      <h1 className="page-title">{label}</h1>
      <p className="page-sub">{blurb}</p>

      {error && <div className="login-error">{error}</div>}

      <div className="section-label">Today</div>
      {!loading && rentvineError ? (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ color: "var(--critical)", fontSize: 13.5, margin: 0, fontWeight: 600 }}>
            Couldn&apos;t load Rentvine data
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0 0" }}>{rentvineError}</p>
        </div>
      ) : (
        <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <StatTile
            label="# of pending work orders"
            value={loading ? "—" : (dayStats?.pendingWorkOrders ?? "—")}
            calculation="Work orders in Rentvine with a status of Requested (received, not yet assigned), as of today."
          />
          <StatTile
            label="# of open work orders"
            value={loading ? "—" : (dayStats?.openWorkOrders ?? "—")}
            calculation="Work orders in Rentvine with a status of Open, as of today. Matches Rentvine's own dashboard."
          />
          <StatTile
            label="# of on hold work orders"
            value={loading ? "—" : (dayStats?.onHoldWorkOrders ?? "—")}
            calculation="Work orders in Rentvine with a status of On Hold (paused, awaiting something), as of today."
          />
          <StatTile
            label="# of work orders that need attention (no update in 3+ days)"
            value={loading ? "—" : (dayStats?.needsAttention ?? "—")}
            calculation="Work orders in Rentvine with a status of Requested, Open, or On Hold that haven't had a status or note update logged in 3 or more days, as of today. Click to see the list."
            onClick={toggleNeedsAttention}
          />
        </div>
      )}

      {needsAttentionOpen && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>Work orders needing attention</p>
          {needsAttentionLoading && <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Loading…</p>}
          {needsAttentionError && (
            <p style={{ color: "var(--critical)", fontSize: 13, margin: 0 }}>{needsAttentionError}</p>
          )}
          {!needsAttentionLoading && !needsAttentionError && needsAttentionList && (
            needsAttentionList.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Nothing needs attention right now.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "4px 8px" }}>WO #</th>
                      <th style={{ padding: "4px 8px" }}>Property / Unit</th>
                      <th style={{ padding: "4px 8px" }}>Description</th>
                      <th style={{ padding: "4px 8px" }}>Last updated</th>
                      <th style={{ padding: "4px 8px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {needsAttentionList.map((wo) => (
                      <tr key={wo.workOrderNumber} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{wo.workOrderNumber}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          {[wo.propertyCode, wo.unitCode].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={{ padding: "6px 8px" }}>{wo.description}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          {wo.lastUpdated ? wo.lastUpdated.slice(0, 10) : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          <a href={wo.rentvineUrl} target="_blank" rel="noopener noreferrer">
                            Open in Rentvine ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      <div className="section-label">Work orders &amp; costs</div>
      <div className="efficiency-filters">
        <div className="filter-row">
          {(["this_month", "last_month", "ytd"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={"filter-chip" + (preset === p ? " active" : "")}
              onClick={() => setPreset(p)}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            className={"filter-chip" + (preset === "custom" ? " active" : "")}
            onClick={() => setPreset("custom")}
          >
            Custom range
          </button>
        </div>
        {preset === "custom" && (
          <>
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {rangeShown && (
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
          Showing {rangeShown.from} through {rangeShown.to}.
        </p>
      )}

      {!rentvineError && (
        <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: 16 }}>
          <StatTile
            label="Days to close a work order (avg)"
            value={loading ? "—" : avgDaysToClose != null ? `${avgDaysToClose.toFixed(1)} days` : "—"}
            calculation="Average days between opening and closing, across work orders closed in the trailing 12 months ending on the last day of the month shown above."
          />
        </div>
      )}

      {!loading && financialsError ? (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ color: "var(--critical)", fontSize: 13.5, margin: 0, fontWeight: 600 }}>
            Couldn&apos;t load QuickBooks data
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0 0" }}>{financialsError}</p>
        </div>
      ) : (
        <>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <StatTile
              label="Total trip charge revenue"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.tripChargeRevenue) : "—"}
              calculation="Sum of the '303 - Trip Charge' line item across all invoices and sales receipts in the selected range."
            />
            <StatTile
              label="Total landscaping revenue"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.landscapingRevenue) : "—"}
              calculation="Sum of the '313 - Landscape Services' line item across all invoices and sales receipts in the selected range."
            />
            <StatTile
              label="% of landscaping goal"
              value={
                loading
                  ? "—"
                  : rangeTotals?.landscapingGoalPercent != null
                    ? `${rangeTotals.landscapingGoalPercent.toFixed(2)}%`
                    : "Goal not set"
              }
              calculation="Total landscaping revenue divided by the landscaping goal for the selected range (the monthly goal x the number of calendar months the range touches), shown as a percentage. Set the goal in the admin section at the bottom of this page."
            />
            <StatTile
              label="$ vs. landscaping goal"
              value={
                loading
                  ? "—"
                  : rangeTotals?.landscapingGoalDelta != null
                    ? `${rangeTotals.landscapingGoalDelta >= 0 ? "+" : ""}${formatCurrency(rangeTotals.landscapingGoalDelta)}`
                    : "Goal not set"
              }
              calculation="Total landscaping revenue minus the landscaping goal for the selected range. Positive means over goal, negative means under. Set the goal in the admin section at the bottom of this page."
            />
            <StatTile
              label="Total gas spend"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.gasSpend) : "—"}
              calculation="Sum of expenses coded to QuickBooks ledger accounts 6113 and 6713, from Purchases and Bills in the selected range."
            />
          </div>

          <SubLabel>Maintenance labor ($)</SubLabel>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <StatTile
              label="Gross labor billed"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborBilledGross) : "—"}
              calculation={`Sum of these Products & Services (dollar amount): ${LABOR_ITEMS_TEXT}`}
            />
            <StatTile
              label="Labor discounted"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborDiscount) : "—"}
              calculation={`Sum of these Products & Services (dollar amount): ${DISCOUNT_ITEMS_TEXT}`}
            />
            <StatTile
              label="Net labor billed"
              value={loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborBilledNet) : "—"}
              calculation="Gross labor billed plus Labor discounted (the discount is a negative number, so this nets it out)."
            />
            <StatTile
              label="% of net labor goal"
              value={loading ? "—" : rangeTotals?.netLaborGoalPercent != null ? `${rangeTotals.netLaborGoalPercent.toFixed(2)}%` : "—"}
              calculation="Net labor billed divided by the goal for the selected range (the monthly goal x the number of calendar months the range touches), shown as a percentage."
            />
            <StatTile
              label="$ vs. net labor goal"
              value={
                loading
                  ? "—"
                  : rangeTotals
                    ? `${rangeTotals.netLaborGoalDelta >= 0 ? "+" : ""}${formatCurrency(rangeTotals.netLaborGoalDelta)}`
                    : "—"
              }
              calculation="Net labor billed minus the goal for the selected range. Positive means over goal, negative means under."
            />
          </div>

          <SubLabel>Maintenance labor (hrs)</SubLabel>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <StatTile
              label="Gross labor billed"
              value={loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursGross) : "—"}
              calculation={`Sum of these Products & Services (quantity billed, in hours): ${LABOR_ITEMS_TEXT}`}
            />
            <StatTile
              label="Labor discounted"
              value={loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursDiscount) : "—"}
              calculation={`Sum of these Products & Services (quantity, in hours): ${DISCOUNT_ITEMS_TEXT}`}
            />
            <StatTile
              label="Net labor billed"
              value={loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursNet) : "—"}
              calculation="Gross labor billed (hrs) plus Labor discounted (hrs) (the discount is a negative number, so this nets it out)."
            />
          </div>
        </>
      )}

      <div className="section-label">Trend (last 12 months)</div>
      {trendError && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: "var(--critical)", fontSize: 13.5, margin: 0, fontWeight: 600 }}>
            Couldn&apos;t load trend data
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0 0" }}>{trendError}</p>
        </div>
      )}
      {!trendError && trend && (
        <div className="card" style={{ padding: 20 }}>
          <MaintenanceTrendChart data={trend} />
        </div>
      )}

      {isAdmin && (
        <>
          <div className="section-label">Admin — net labor goal</div>
          <div className="card" style={{ padding: 16 }}>
            {editingGoal ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Monthly goal ($)</span>
                <input
                  type="number"
                  min={1}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  style={{ width: 100 }}
                />
                <button type="button" className="btn primary" disabled={savingGoal} onClick={saveGoal}>
                  {savingGoal ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn" disabled={savingGoal} onClick={() => setEditingGoal(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setGoalInput(monthlyGoal != null ? String(monthlyGoal) : "");
                  setEditingGoal(true);
                }}
              >
                Edit monthly goal{monthlyGoal != null ? ` (currently ${formatCurrency(monthlyGoal)}/mo)` : ""}
              </button>
            )}
          </div>

          <div className="section-label">Admin — landscaping goal</div>
          <div className="card" style={{ padding: 16 }}>
            {editingLandscapingGoal ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Monthly goal ($)</span>
                <input
                  type="number"
                  min={1}
                  value={landscapingGoalInput}
                  onChange={(e) => setLandscapingGoalInput(e.target.value)}
                  style={{ width: 100 }}
                />
                <button type="button" className="btn primary" disabled={savingLandscapingGoal} onClick={saveLandscapingGoal}>
                  {savingLandscapingGoal ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={savingLandscapingGoal}
                  onClick={() => setEditingLandscapingGoal(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setLandscapingGoalInput(landscapingMonthlyGoal != null ? String(landscapingMonthlyGoal) : "");
                  setEditingLandscapingGoal(true);
                }}
              >
                Edit monthly goal
                {landscapingMonthlyGoal != null ? ` (currently ${formatCurrency(landscapingMonthlyGoal)}/mo)` : " (not set yet)"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
