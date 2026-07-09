"use client";

import { useEffect, useState } from "react";

type UserLite = { id: string; name: string; initials: string; color: string };

type SummaryRow = {
  userId: string;
  name: string;
  initials: string;
  color: string;
  meetingsTracked: number;
  attended: number;
  late: number;
  missed: number;
  prepared: number;
  unprepared: number;
  distracted: number;
};

type DetailRow = {
  instanceId: string;
  seriesName: string;
  startsAt: string;
  status: "PRESENT" | "LATE" | "ABSENT" | null;
  prepared: boolean | null;
  focused: boolean | null;
};

const STATUS_LABEL: Record<string, string> = { PRESENT: "On time", LATE: "Late", ABSENT: "No-show" };

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDetailDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default function MeetingEfficiencyApp({ users }: { users: UserLite[] }) {
  const [userId, setUserId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<"30" | "90" | "all" | "custom">("all");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [detail, setDetail] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setLoading(true);
    setError(null);
    fetch(`/api/admin/meeting-efficiency?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load stats.");
        setSummary(json.summary ?? []);
        setDetail(json.detail ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats."))
      .finally(() => setLoading(false));
  }, [userId, from, to]);

  function applyPreset(p: "30" | "90" | "all") {
    setPreset(p);
    if (p === "all") {
      setFrom("");
      setTo("");
    } else {
      setFrom(daysAgoInput(Number(p)));
      setTo(todayInput());
    }
  }

  return (
    <div>
      <h1 className="page-title">Meeting Efficiency</h1>
      <p className="page-sub">
        Admin-only tracking of who showed up, on time, prepared, and focused across meetings —
        filter by person and time range to see their stats.
      </p>

      <div className="efficiency-filters">
        <label>
          Team member
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="all">All team members</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-row">
          <button
            type="button"
            className={"filter-chip" + (preset === "30" ? " active" : "")}
            onClick={() => applyPreset("30")}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={"filter-chip" + (preset === "90" ? " active" : "")}
            onClick={() => applyPreset("90")}
          >
            Last 90 days
          </button>
          <button
            type="button"
            className={"filter-chip" + (preset === "all" ? " active" : "")}
            onClick={() => applyPreset("all")}
          >
            All time
          </button>
        </div>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPreset("custom");
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPreset("custom");
              setTo(e.target.value);
            }}
          />
        </label>
      </div>

      {error && <div className="login-error">{error}</div>}

      <table className="list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Meetings tracked</th>
            <th>Attended</th>
            <th>Late</th>
            <th>Missed</th>
            <th>Prepared</th>
            <th>Distracted</th>
          </tr>
        </thead>
        <tbody>
          {!loading && summary.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-state">
                No meetings have been marked yet for this filter.
              </td>
            </tr>
          )}
          {summary.map((s) => (
            <tr key={s.userId}>
              <td>
                <span className="efficiency-summary-cell">
                  <span className="avatar-chip" style={{ background: `var(--${s.color})`, color: "#fff" }}>
                    {s.initials}
                  </span>
                  {s.name}
                </span>
              </td>
              <td>{s.meetingsTracked}</td>
              <td>{s.attended}</td>
              <td>{s.late}</td>
              <td>{s.missed}</td>
              <td>{s.prepared}</td>
              <td>{s.distracted}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {userId !== "all" && (
        <>
          <div className="section-label">Meeting-by-meeting breakdown</div>
          <table className="list-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meeting</th>
                <th>Status</th>
                <th>Prepared</th>
                <th>Focused</th>
              </tr>
            </thead>
            <tbody>
              {detail.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No marked meetings in this range.
                  </td>
                </tr>
              )}
              {detail.map((d) => (
                <tr key={d.instanceId}>
                  <td>{fmtDetailDate(d.startsAt)}</td>
                  <td>{d.seriesName}</td>
                  <td>{d.status ? STATUS_LABEL[d.status] : "—"}</td>
                  <td>{d.prepared === null ? "—" : d.prepared ? "Yes" : "No"}</td>
                  <td>{d.focused === null ? "—" : d.focused ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
