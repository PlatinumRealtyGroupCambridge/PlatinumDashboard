"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

type TrendPoint = {
  month: string;
  netLaborBilled: number;
  tripChargeRevenue: number;
  gasSpend: number;
  goal: number;
};

type LineKey = "netLaborBilled" | "tripChargeRevenue" | "gasSpend" | "goal";

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 20, right: 20, bottom: 34, left: 60 };

// Fixed order/colors, following the app's established categorical
// sequence (blue, aqua, yellow, ...) — Goal is a dashed muted reference
// line rather than a fourth bright hue, since it's a target, not a
// measured quantity.
const LINES: { key: LineKey; label: string; color: string; dashed?: boolean }[] = [
  { key: "netLaborBilled", label: "Net labor billed", color: "var(--series-blue)" },
  { key: "tripChargeRevenue", label: "Trip charge revenue", color: "var(--series-aqua)" },
  { key: "gasSpend", label: "Gas spend", color: "var(--series-yellow)" },
  { key: "goal", label: "Net labor goal", color: "var(--text-muted)", dashed: true },
];

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

// Trailing-12-month line chart for Net Labor Billed, Trip Charge Revenue,
// Gas Spend, and the Net Labor Goal — all four share one $ axis (same
// unit, so no dual-axis needed). Click a legend entry to show/hide that
// line; the axis scale stays fixed across all four regardless of what's
// toggled, so the chart doesn't jump around as lines are hidden.
export default function MaintenanceTrendChart({ data }: { data: TrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    netLaborBilled: true,
    tripChargeRevenue: true,
    gasSpend: true,
    goal: true,
  });

  if (data.length === 0) return null;

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;
  const stepCount = Math.max(1, data.length - 1);
  const colWidth = plotW / (data.length || 1);

  const maxValue =
    Math.max(1, ...data.map((d) => Math.max(d.netLaborBilled, d.tripChargeRevenue, d.gasSpend, d.goal))) * 1.1;

  const xFor = (i: number) => PADDING.left + (data.length === 1 ? plotW / 2 : (i / stepCount) * plotW);
  const yFor = (v: number) => PADDING.top + plotH - (v / maxValue) * plotH;

  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`).join(" ");

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex != null ? data[hoverIndex] : null;

  function toggle(key: LineKey) {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap", fontSize: 12 }}>
        {LINES.map((line) => (
          <button
            key={line.key}
            type="button"
            onClick={() => toggle(line.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: visible[line.key] ? "var(--text-secondary)" : "var(--text-muted)",
              opacity: visible[line.key] ? 1 : 0.5,
            }}
          >
            {line.dashed ? (
              <span style={{ width: 14, borderTop: `2px dashed ${line.color}`, display: "inline-block" }} />
            ) : (
              <span style={{ width: 14, height: 2, background: line.color, display: "inline-block" }} />
            )}
            {line.label}
          </button>
        ))}
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

        {LINES.map(
          (line) =>
            visible[line.key] && (
              <path
                key={line.key}
                d={linePath(data.map((d) => d[line.key]))}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={line.dashed ? "5 4" : undefined}
              />
            )
        )}

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
        {hovered &&
          LINES.map(
            (line) =>
              visible[line.key] &&
              !line.dashed && (
                <circle key={line.key} cx={xFor(hoverIndex!)} cy={yFor(hovered[line.key])} r={4} fill={line.color} />
              )
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
          {LINES.filter((line) => visible[line.key]).map((line) => (
            <div key={line.key} style={{ color: line.dashed ? "var(--text-muted)" : undefined }}>
              {line.label}: {formatCurrency(hovered[line.key])}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
