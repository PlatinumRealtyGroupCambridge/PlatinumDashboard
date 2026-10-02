"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type NeedsAttentionWorkOrder = {
  workOrderNumber: number;
  rentvineUrl: string;
  propertyCode: string | null;
  unitCode: string | null;
  description: string;
  lastUpdated: string | null;
};

export default function NeedsAttentionList({ label, isAdmin }: { label: string; isAdmin: boolean }) {
  const [list, setList] = useState<NeedsAttentionWorkOrder[] | null>(null);
  const [rawSample, setRawSample] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        more days, as of today. Oldest update first.
      </p>

      {loading && <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</p>}
      {error && <div className="login-error">{error}</div>}

      {!loading && !error && list && (
        list.length === 0 ? (
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
                  <th style={{ padding: "10px 16px" }}>WO #</th>
                  <th style={{ padding: "10px 16px" }}>Property / Unit</th>
                  <th style={{ padding: "10px 16px" }}>Description</th>
                  <th style={{ padding: "10px 16px" }}>Last updated</th>
                  <th style={{ padding: "10px 16px" }} />
                </tr>
              </thead>
              <tbody>
                {list.map((wo) => (
                  <tr key={wo.workOrderNumber} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{wo.workOrderNumber}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {[wo.propertyCode, wo.unitCode].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>{wo.description}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {wo.lastUpdated ? wo.lastUpdated.slice(0, 10) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
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
  );
}
