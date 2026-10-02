"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type NeedsAttentionWorkOrder = {
  workOrderNumber: number;
  rentvineUrl: string;
  property: string | null;
  unit: string | null;
  description: string;
  status: string | null;
  lastUpdated: string | null;
  daysSinceUpdate: number | null;
};

type SortKey = "workOrderNumber" | "property" | "status" | "lastUpdated" | "daysSinceUpdate";
type SortDir = "asc" | "desc";

// Which direction makes sense the first time a column is clicked — e.g.
// days-since-update should lead with the most overdue, not the least.
const DEFAULT_DIRECTION: Record<SortKey, SortDir> = {
  workOrderNumber: "asc",
  property: "asc",
  status: "asc",
  lastUpdated: "asc",
  daysSinceUpdate: "desc",
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "workOrderNumber", label: "WO #" },
  { key: "property", label: "Property / Unit" },
  { key: "status", label: "Status" },
  { key: "lastUpdated", label: "Last updated" },
  { key: "daysSinceUpdate", label: "Days since update" },
];

function compareValues(a: NeedsAttentionWorkOrder, b: NeedsAttentionWorkOrder, key: SortKey): number {
  switch (key) {
    case "workOrderNumber":
      return a.workOrderNumber - b.workOrderNumber;
    case "property":
      return (a.property ?? "").localeCompare(b.property ?? "");
    case "status":
      return (a.status ?? "").localeCompare(b.status ?? "");
    case "lastUpdated":
      return (a.lastUpdated ?? "").localeCompare(b.lastUpdated ?? "");
    case "daysSinceUpdate":
      return (a.daysSinceUpdate ?? 0) - (b.daysSinceUpdate ?? 0);
  }
}

export default function NeedsAttentionList({ label, isAdmin }: { label: string; isAdmin: boolean }) {
  const [list, setList] = useState<NeedsAttentionWorkOrder[] | null>(null);
  const [rawSample, setRawSample] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("daysSinceUpdate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/maintenance/needs-attention")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json?.error || "Failed to load the list.");
        setList(json.workOrders);
        setRawSample(json.rawSample ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the list."))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIRECTION[key]);
    }
  }

  const sortedList = useMemo(() => {
    if (!list) return null;
    const sorted = [...list].sort((a, b) => compareValues(a, b, sortKey));
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [list, sortKey, sortDir]);

  return (
    <div>
      <Link href="/maintenance" style={{ fontSize: 13, color: "var(--text-muted)" }}>
        ← Back to {label}
      </Link>
      <h1 className="page-title" style={{ marginTop: 10 }}>
        Work orders needing attention
      </h1>
      <p className="page-sub">
        Open work orders (Requested, Open, or On Hold) that haven&apos;t had a status or note update logged in 3 or
        more days, as of today. Click a column heading to sort.
      </p>

      {loading && <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</p>}
      {error && <div className="login-error">{error}</div>}

      {!loading && !error && sortedList && (
        sortedList.length === 0 ? (
          <>
            <div className="card empty-state">Nothing needs attention right now.</div>
            {isAdmin && rawSample && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>
                  Admin diagnostic: this list came back empty but Rentvine reported matching work orders.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 10px" }}>
                  Something about Rentvine&apos;s response shape isn&apos;t being read correctly. Copy the text
                  below and send it along to fix it.
                </p>
                <textarea
                  readOnly
                  value={rawSample}
                  style={{ width: "100%", height: 220, fontFamily: "monospace", fontSize: 11.5 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                  {COLUMNS.map((col) => {
                    const active = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{ padding: "10px 16px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Click to sort"
                      >
                        {col.label}
                        {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    );
                  })}
                  <th style={{ padding: "10px 16px" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((wo) => (
                  <tr key={wo.workOrderNumber} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      <a href={wo.rentvineUrl} target="_blank" rel="noopener noreferrer">
                        {wo.workOrderNumber}
                      </a>
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {[wo.property, wo.unit].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{wo.status ?? "—"}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {wo.lastUpdated ? wo.lastUpdated.slice(0, 10) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {wo.daysSinceUpdate ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>{wo.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
