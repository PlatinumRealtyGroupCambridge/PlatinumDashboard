"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

type TrendPoint = { month: string; netLaborBilled: number; tripChargeRevenue: number; goal: number };

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 20, right: 20, bottom: 34, left: 60 };

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

// Trailing-12-month line chart for Net Labor Billed, Trip Charge Revenue,
// and the Net Labor Goal — all three share one $ axis (same unit, so no
// dual-axis needed). Net Labor and Trip Charge use the app's fixed
// categorical colors in their established order (blue, then aqua); Goal is
// a dashed muted reference line rather than a third bright hue, since it's
// a target, not a measured quantity.
export default function MaintenanceTrendChart({ data }: { data: TrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;
  const stepCount = Math.max(1, data.length - 1);
  const colWidth = plotW / (data.length || 1);

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.netLaborBilled, d.tripChargeRevenue, d.goal))) * 1.1;

  const xFor = (i: number) => PADDING.left + (data.length === 1 ? plotW / 2 : (i / stepCount) * plotW);
  const yFor = (v: number) => PADDING.top + plotH - (v / maxValue) * plotH;

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`).join(" ");

  const netLaborPath = linePath(data.map((d) => d.netLaborBilled));
  const tripChargePath = linePath(data.map((d) => d.tripChargeRevenue));
  const goalPath = linePath(data.map((d) => d.goal));

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--series-blue)", display: "inline-block" }} />
          Net labor billed
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--series-aqua)", display: "inline-block" }} />
          Trip charge revenue
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, borderTop: "2px dashed var(--text-muted)", display: "inline-block" }} />
          Net labor goal
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {gridFractions.map((f) => (
          <line
            key={f}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={PADDING.top + plotH - f * plotH}
            y2={PADDING.top + plotH - f * plotH}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}

        {gridFractions.map((f) => (
          <text
            key={f}
            x={PADDING.left - 8}
            y={PADDING.top + plotH - f * plotH + 4}
            textAnchor="end"
            fontSize={10}
            fill="var(--text-muted)"
          >
            {formatCurrency(maxValue * f)}
          </text>
        ))}

        {data.map((d, i) => (
          <text key={d.month} x={xFor(i)} y={HEIGHT - PADDING.bottom + 18} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
            {monthLabel(d.month)}
          </text>
        ))}

        <path d={goalPath} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        <path d={tripChargePath} fill="none" stroke="var(--series-aqua)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={netLaborPath} fill="none" stroke="var(--series-blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hoverIndex != null && (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={PADDING.top}
            y2={PADDING.top + plotH}
            stroke="var(--border)"
            strokeWidth={1}
          />
        )}
        {hovered && (
          <>
            <circle cx={xFor(hoverIndex!)} cy={yFor(hovered.netLaborBilled)} r={4} fill="var(--series-blue)" />
            <circle cx={xFor(hoverIndex!)} cy={yFor(hovered.tripChargeRevenue)} r={4} fill="var(--series-aqua)" />
          </>
        )}

        {data.map((d, i) => (
          <rect
            key={d.month}
            x={xFor(i) - colWidth / 2}
            y={PADDING.top}
            width={colWidth}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}
      </svg>

      {hovered && (
        <div className="card" style={{ padding: "10px 14px", marginTop: 8, display: "inline-block", fontSize: 12.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{monthLabel(hovered.month)}</div>
          <div>Net labor billed: {formatCurrency(hovered.netLaborBilled)}</div>
          <div>Trip charge revenue: {formatCurrency(hovered.tripChargeRevenue)}</div>
          <div style={{ color: "var(--text-muted)" }}>Goal: {formatCurrency(hovered.goal)}</div>
        </div>
      )}
    </div>
  );
}
