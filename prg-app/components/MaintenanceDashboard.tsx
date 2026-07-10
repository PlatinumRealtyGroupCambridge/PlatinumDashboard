"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatHours } from "@/lib/format";
import MaintenanceTrendChart from "./MaintenanceTrendChart";

type TrendPoint = { month: string; netLaborBilled: number; tripChargeRevenue: number; goal: number };

type DayStats = { openWorkOrders: number; needsAttention: number };
type RangeTotals = {
  avgDaysToClose: number | null;
  laborBilledGross: number;
  laborDiscount: number;
  laborBilledNet: number;
  laborHoursGross: number;
  laborHoursDiscount: number;
  laborHoursNet: number;
  tripChargeRevenue: number;
  gasSpend: number;
  netLaborGoal: number;
  netLaborGoalPercent: number | null;
  netLaborGoalDelta: number;
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

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESET_LABELS: Record<Exclude<Preset, "custom">, string> = {
  this_month: "This month",
  last_month: "Last month",
  ytd: "Year to date",
};

export default function MaintenanceDashboard({ label, blurb }: { label: string; blurb: string }) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(todayInput());
  const [to, setTo] = useState(todayInput());
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [rangeTotals, setRangeTotals] = useState<RangeTotals | null>(null);
  const [financialsError, setFinancialsError] = useState<string | null>(null);
  const [rangeShown, setRangeShown] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  // Trailing-12-month trend is independent of the date-range filter above,
  // so it's fetched once rather than on every preset/date change.
  useEffect(() => {
    fetch("/api/maintenance/trend")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load trend data.");
        if (json.trend) setTrend(json.trend);
        else setTrendError(json.error ?? "Couldn't load trend data.");
      })
      .catch((err) => setTrendError(err instanceof Error ? err.message : "Failed to load trend data."));
  }, []);

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
        setRangeTotals(json.rangeTotals);
        setFinancialsError(json.financialsError ?? null);
        setRangeShown(json.range);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load maintenance stats."))
      .finally(() => setLoading(false));
  }, [preset, from, to]);

  return (
    <div>
      <h1 className="page-title">{label}</h1>
      <p className="page-sub">{blurb}</p>

      {error && <div className="login-error">{error}</div>}

      <div className="section-label">Today</div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          background: "var(--page)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          padding: "5px 12px",
          marginBottom: 14,
        }}
      >
        <span
          className="dot"
          style={{ background: "var(--series-brown)", width: 8, height: 8, borderRadius: "50%" }}
        />
        Sample data for now — not yet connected to Rentvine
      </div>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat-tile">
          <div className="label"># of open work orders</div>
          <div className="value">{loading ? "—" : (dayStats?.openWorkOrders ?? "—")}</div>
        </div>
        <div className="stat-tile">
          <div className="label"># of work orders that need attention (no update in 3+ days)</div>
          <div className="value">{loading ? "—" : (dayStats?.needsAttention ?? "—")}</div>
        </div>
      </div>

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
            <div className="stat-tile">
              <div className="label">Days to close a work order (avg)</div>
              <div className="value">
                {loading ? "—" : rangeTotals?.avgDaysToClose != null ? `${rangeTotals.avgDaysToClose.toFixed(1)} days` : "—"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">Total trip charge revenue</div>
              <div className="value">
                {loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.tripChargeRevenue) : "—"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">Total gas spend</div>
              <div className="value">{loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.gasSpend) : "—"}</div>
            </div>
          </div>

          <SubLabel>Maintenance labor ($)</SubLabel>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div className="stat-tile">
              <div className="label">Gross labor billed</div>
              <div className="value">
                {loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborBilledGross) : "—"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">Labor discounted</div>
              <div className="value">{loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborDiscount) : "—"}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Net labor billed</div>
              <div className="value">{loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborBilledNet) : "—"}</div>
            </div>
            <div className="stat-tile">
              <div className="label">% of net labor goal</div>
              <div className="value">
                {loading ? "—" : rangeTotals?.netLaborGoalPercent != null ? `${rangeTotals.netLaborGoalPercent.toFixed(0)}%` : "—"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">$ vs. net labor goal</div>
              <div className="value">
                {loading
                  ? "—"
                  : rangeTotals
                    ? `${rangeTotals.netLaborGoalDelta >= 0 ? "+" : ""}${formatCurrency(rangeTotals.netLaborGoalDelta)}`
                    : "—"}
              </div>
            </div>
          </div>

          <SubLabel>Maintenance labor (hrs)</SubLabel>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div className="stat-tile">
              <div className="label">Gross labor billed</div>
              <div className="value">{loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursGross) : "—"}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Labor discounted</div>
              <div className="value">
                {loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursDiscount) : "—"}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">Net labor billed</div>
              <div className="value">{loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHoursNet) : "—"}</div>
            </div>
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
    </div>
  );
}
