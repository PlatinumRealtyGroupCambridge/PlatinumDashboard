"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatHours } from "@/lib/format";

type DayStats = { openWorkOrders: number; avgDaysToClose: number | null };
type RangeTotals = { laborBilled: number; laborHours: number; tripChargeRevenue: number; gasSpend: number };
type Preset = "this_month" | "last_month" | "ytd" | "custom";

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
  const [rangeShown, setRangeShown] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setRangeShown(json.range);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load maintenance stats."))
      .finally(() => setLoading(false));
  }, [preset, from, to]);

  return (
    <div>
      <h1 className="page-title">{label}</h1>
      <p className="page-sub">{blurb}</p>

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
          marginBottom: 22,
        }}
      >
        <span
          className="dot"
          style={{ background: "var(--series-brown)", width: 8, height: 8, borderRadius: "50%" }}
        />
        Sample data for now — not yet connected to Rentvine or QuickBooks
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="section-label">Today</div>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat-tile">
          <div className="label"># of open work orders</div>
          <div className="value">{loading ? "—" : (dayStats?.openWorkOrders ?? "—")}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Days to close a work order (avg, last 90 days)</div>
          <div className="value">
            {loading ? "—" : dayStats?.avgDaysToClose != null ? `${dayStats.avgDaysToClose.toFixed(1)} days` : "—"}
          </div>
        </div>
      </div>

      <div className="section-label">Labor &amp; costs</div>
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

      <div className="stat-row">
        <div className="stat-tile">
          <div className="label">Total maintenance labor billed ($)</div>
          <div className="value">{loading ? "—" : rangeTotals ? formatCurrency(rangeTotals.laborBilled) : "—"}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total maintenance labor billed (hrs)</div>
          <div className="value">{loading ? "—" : rangeTotals ? formatHours(rangeTotals.laborHours) : "—"}</div>
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
    </div>
  );
}
