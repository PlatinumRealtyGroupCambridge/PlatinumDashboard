"use client";

import { useEffect, useState } from "react";
import type {
  AgendaItemData,
  AttendanceRow,
  MeetingManagementData,
  SeriesData,
  TaskData,
  UserLite,
} from "@/lib/meeting-types";
import {
  apiJson,
  defaultDueDateInput,
  fmtDate,
  fmtDueDate,
  fmtTime,
  monthLabel,
  useAutosave,
} from "@/lib/meeting-client-utils";

// ---------- component ----------

type OpenMeeting = { seriesId: string; instanceId: string } | null;

export default function MeetingApp({
  initialData,
  currentUserId,
  isAdmin,
  zoomLink,
  initialOpenInstanceId,
}: {
  initialData: MeetingManagementData;
  currentUserId: string;
  isAdmin: boolean;
  zoomLink: string;
  initialOpenInstanceId: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [currentUser] = useState(currentUserId);
  const [calendarViewMode, setCalendarViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [openMeeting, setOpenMeeting] = useState<OpenMeeting>(() => {
    if (!initialOpenInstanceId) return null;
    for (const s of initialData.series) {
      if (s.instances.some((i) => i.id === initialOpenInstanceId)) {
        return { seriesId: s.id, instanceId: initialOpenInstanceId };
      }
    }
    return null;
  });

  const userById = (id: string | null): UserLite | undefined =>
    id ? data.users.find((u) => u.id === id) : undefined;
  const seriesById = (id: string) => data.series.find((s) => s.id === id);

  const seriesForUser = (uid: string) => data.series.filter((s) => s.participantIds.includes(uid));

  function pendingCount(instance: { agendaItems: AgendaItemData[] }) {
    return instance.agendaItems.filter((a) => !a.discussed).length;
  }

  // ---------- mutation helpers (optimistic local state updates) ----------

  function patchAgendaItem(itemId: string, patch: Partial<AgendaItemData>) {
    setData((d) => ({
      ...d,
      series: d.series.map((s) => ({
        ...s,
        instances: s.instances.map((inst) => ({
          ...inst,
          agendaItems: inst.agendaItems.map((a) => (a.id === itemId ? { ...a, ...patch } : a)),
        })),
      })),
    }));
  }

  async function toggleDiscussed(item: AgendaItemData) {
    const next = !item.discussed;
    patchAgendaItem(item.id, { discussed: next });
    await apiJson(`/api/agenda-items/${item.id}`, "PATCH", { discussed: next }).catch(() => {
      patchAgendaItem(item.id, { discussed: !next });
    });
  }

  async function saveAgendaNotes(item: AgendaItemData, notes: string) {
    patchAgendaItem(item.id, { notes });
    await apiJson(`/api/agenda-items/${item.id}`, "PATCH", { notes }).catch(() => {});
  }

  async function deleteAgendaItem(item: AgendaItemData) {
    const snapshot = data;
    setData((d) => ({
      ...d,
      series: d.series.map((s) => ({
        ...s,
        instances: s.instances.map((inst) => ({
          ...inst,
          agendaItems: inst.agendaItems.filter((a) => a.id !== item.id),
        })),
      })),
    }));
    await apiJson(`/api/agenda-items/${item.id}`, "DELETE").catch(() => {
      setData(snapshot);
    });
  }

  async function addAgendaItem(instanceId: string, title: string) {
    const { item } = await apiJson("/api/agenda-items", "POST", {
      instanceId,
      title,
      addedById: currentUser,
    });
    setData((d) => ({
      ...d,
      series: d.series.map((s) => ({
        ...s,
        instances: s.instances.map((inst) =>
          inst.id === instanceId
            ? {
                ...inst,
                agendaItems: [
                  ...inst.agendaItems,
                  {
                    id: item.id,
                    instanceId,
                    title: item.title,
                    discussed: false,
                    notes: "",
                    tabled: false,
                    addedById: item.addedById,
                    sourceType: null,
                    sourceTaskId: null,
                    sourceGoalId: null,
                    taskIds: [],
                  },
                ],
              }
            : inst
        ),
      })),
    }));
  }

  async function tableToNextMeeting(item: AgendaItemData) {
    const { item: updated, instance } = await apiJson(`/api/agenda-items/${item.id}/table`, "POST");
    setData((d) => {
      const series = d.series.map((s) => {
        if (s.id !== instance.seriesId) return s;
        const hasInstance = s.instances.some((i) => i.id === instance.id);
        const instances = hasInstance
          ? s.instances
          : [...s.instances, { id: instance.id, seriesId: instance.seriesId, startsAt: instance.startsAt, agendaItems: [] }];
        return {
          ...s,
          instances: instances
            .map((inst) => {
              if (inst.id === item.instanceId) {
                return { ...inst, agendaItems: inst.agendaItems.filter((a) => a.id !== item.id) };
              }
              if (inst.id === updated.instanceId) {
                const movedItem: AgendaItemData = {
                  ...item,
                  instanceId: updated.instanceId,
                  discussed: updated.discussed,
                  tabled: updated.tabled,
                  notes: updated.notes,
                };
                return { ...inst, agendaItems: [...inst.agendaItems.filter((a) => a.id !== item.id), movedItem] };
              }
              return inst;
            })
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
        };
      });
      return { ...d, series };
    });
  }

  async function createMeeting(input: {
    title: string;
    date: string;
    time: string;
    durationMins: number;
    participantUserIds: string[];
  }) {
    const { series } = await apiJson("/api/meetings", "POST", input);
    setData((d) => ({ ...d, series: [...d.series, series] }));
    setShowNewMeetingForm(false);
    setOpenMeeting({ seriesId: series.id, instanceId: series.instances[0].id });
  }

  async function deleteMeeting(instanceId: string) {
    await apiJson(`/api/meeting-instances/${instanceId}`, "DELETE");
    setData((d) => {
      const series = d.series
        .map((s) => ({ ...s, instances: s.instances.filter((i) => i.id !== instanceId) }))
        // A one-off meeting's series is deleted server-side along with its
        // one and only instance (see deleteMeetingInstance's comment) — mirror
        // that here so it doesn't linger in local state as an empty series.
        .filter((s) => !(s.type === "ONE_OFF" && s.instances.length === 0));
      return { ...d, series };
    });
    setOpenMeeting(null);
  }

  const [showNewMeetingForm, setShowNewMeetingForm] = useState(false);
  const [openTaskFormFor, setOpenTaskFormFor] = useState<string | null>(null);

  // ---------- Meeting Efficiency (admin-only attendance tracking) ----------
  // Fetched on demand per-instance rather than bundled into the initial
  // payload — only admins ever need it, and most instances an admin opens
  // will never actually be looked at for attendance.
  const [attendanceByInstance, setAttendanceByInstance] = useState<Record<string, AttendanceRow[]>>({});

  useEffect(() => {
    if (!isAdmin || !openMeeting) return;
    const instanceId = openMeeting.instanceId;
    if (attendanceByInstance[instanceId]) return;
    let cancelled = false;
    apiJson(`/api/meeting-instances/${instanceId}/attendance`, "GET")
      .then(({ attendance }) => {
        if (!cancelled) setAttendanceByInstance((m) => ({ ...m, [instanceId]: attendance }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, openMeeting?.instanceId]);

  async function markAttendance(
    instanceId: string,
    userId: string,
    patch: Partial<Pick<AttendanceRow, "status" | "prepared" | "focused">>
  ) {
    setAttendanceByInstance((m) => {
      const rows = m[instanceId] ?? [];
      const existing = rows.find((r) => r.userId === userId);
      const updated: AttendanceRow = existing
        ? { ...existing, ...patch }
        : { userId, status: null, prepared: null, focused: null, ...patch };
      return { ...m, [instanceId]: [...rows.filter((r) => r.userId !== userId), updated] };
    });
    await apiJson(`/api/meeting-instances/${instanceId}/attendance`, "PATCH", { userId, ...patch }).catch(() => {});
  }

  async function createTaskFromAgendaItem(
    item: AgendaItemData,
    title: string,
    assigneeId: string,
    dueDate: string
  ) {
    const { task } = await apiJson(`/api/agenda-items/${item.id}/tasks`, "POST", {
      title,
      assigneeId,
      dueDate,
    });
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id: task.id,
          title: task.title,
          notes: "",
          done: false,
          archived: false,
          dueDate: task.dueDate,
          assigneeId: task.assigneeId,
          agendaItemId: item.id,
          meetingRefs: [],
          goalId: null,
          goalTitle: null,
        },
      ],
      series: d.series.map((s) => ({
        ...s,
        instances: s.instances.map((inst) => ({
          ...inst,
          agendaItems: inst.agendaItems.map((a) =>
            a.id === item.id ? { ...a, taskIds: [...a.taskIds, task.id] } : a
          ),
        })),
      })),
    }));
    setOpenTaskFormFor(null);
  }

  // ---------- render ----------

  if (openMeeting) {
    const series = seriesById(openMeeting.seriesId);
    const instance = series?.instances.find((i) => i.id === openMeeting.instanceId);
    if (series && instance) {
      return (
        <LiveMeeting
          series={series}
          instance={instance}
          zoomLink={zoomLink}
          userById={userById}
          onBack={() => setOpenMeeting(null)}
          onToggleDiscussed={toggleDiscussed}
          onSaveNotes={saveAgendaNotes}
          onAddAgendaItem={(title) => addAgendaItem(instance.id, title)}
          onTable={tableToNextMeeting}
          onDelete={deleteAgendaItem}
          onDeleteMeeting={() => deleteMeeting(instance.id)}
          openTaskFormFor={openTaskFormFor}
          setOpenTaskFormFor={setOpenTaskFormFor}
          onCreateTask={createTaskFromAgendaItem}
          allUsers={data.users}
          tasksById={(id) => data.tasks.find((t) => t.id === id)}
          isAdmin={isAdmin}
          attendance={attendanceByInstance[instance.id] ?? []}
          onMarkAttendance={(userId, patch) => markAttendance(instance.id, userId, patch)}
        />
      );
    }
  }

  return (
    <div>
      <div className="detail-panel-header">
        <div>
          <h1 className="page-title">Meeting Management</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Leadership &amp; team meetings and 1-on-1s, and their live agendas.
          </p>
        </div>
        <button className="btn primary" onClick={() => setShowNewMeetingForm((v) => !v)}>
          {showNewMeetingForm ? "Cancel" : "+ New meeting"}
        </button>
      </div>

      {showNewMeetingForm && (
        <NewMeetingForm
          users={data.users}
          currentUserId={currentUser}
          onCreate={createMeeting}
          onCancel={() => setShowNewMeetingForm(false)}
        />
      )}

      <div style={{ marginTop: 22 }} />

      {calendarViewMode === "list" ? (
        <MeetingsList
          mySeries={seriesForUser(currentUser)}
          zoomLink={zoomLink}
          userById={userById}
          pendingCount={pendingCount}
          onOpen={(seriesId, instanceId) => setOpenMeeting({ seriesId, instanceId })}
          onSwitchView={() => setCalendarViewMode("calendar")}
        />
      ) : (
        <MeetingsCalendar
          mySeries={seriesForUser(currentUser)}
          monthOffset={calendarMonthOffset}
          setMonthOffset={setCalendarMonthOffset}
          onOpen={(seriesId, instanceId) => setOpenMeeting({ seriesId, instanceId })}
          onSwitchView={() => setCalendarViewMode("list")}
        />
      )}
    </div>
  );
}

// ---------- Meeting card (shared by list/calendar views) ----------

function MeetingCard({
  series,
  instance,
  zoomLink,
  userById,
  pending,
  onClick,
}: {
  series: SeriesData;
  instance: { id: string; startsAt: string; agendaItems: AgendaItemData[] };
  zoomLink: string;
  userById: (id: string | null) => UserLite | undefined;
  pending: number;
  onClick: () => void;
}) {
  const date = new Date(instance.startsAt);
  return (
    <div className="card meeting-card" onClick={onClick}>
      <div className="m-left">
        <span className="dot" style={{ background: `var(--${series.color})` }} />
        <div className="m-info">
          <div className="m-title">{series.name}</div>
          <div className="m-meta">
            {fmtDate(date)} · {fmtTime(date)} · {series.durationMins} min ·{" "}
            {series.participantIds.map((id) => userById(id)?.name.split(" ")[0]).join(", ")}
          </div>
        </div>
      </div>
      <div className="m-right">
        <a
          className="btn zoom-btn"
          href={zoomLink}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
        >
          Join Zoom
        </a>
        {pending > 0 ? (
          <span className="pill pending">{pending} pending</span>
        ) : (
          <span className="pill none">All clear</span>
        )}
        <span className="chev">&rsaquo;</span>
      </div>
    </div>
  );
}

function nextInstance(series: SeriesData) {
  const now = Date.now();
  const upcoming = series.instances.filter((i) => new Date(i.startsAt).getTime() >= now);
  if (upcoming.length) return upcoming[0];
  return series.instances[series.instances.length - 1];
}

// ---------- New one-off meeting ----------

function NewMeetingForm({
  users,
  currentUserId,
  onCreate,
  onCancel,
}: {
  users: UserLite[];
  currentUserId: string;
  onCreate: (input: {
    title: string;
    date: string;
    time: string;
    durationMins: number;
    participantUserIds: string[];
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMins, setDurationMins] = useState(30);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const otherUsers = users.filter((u) => u.id !== currentUserId);

  function toggleParticipant(id: string) {
    setParticipantIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit() {
    if (!title.trim() || !date || !time) {
      setError("Give the meeting a title, date, and time.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onCreate({ title: title.trim(), date, time, durationMins, participantUserIds: participantIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the meeting.");
      setSaving(false);
    }
  }

  return (
    <div className="card admin-form">
      {error && <div className="login-error">{error}</div>}
      <div className="admin-form-grid">
        <label>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vendor walkthrough"
          />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          Duration
          <select value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        </label>
      </div>
      <div className="section-checkbox-label">Who else is in this meeting? (you&apos;re always included)</div>
      <div className="section-checkbox-grid">
        {otherUsers.map((u) => {
          const checked = participantIds.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={"section-checkbox" + (checked ? " checked" : "")}
              onClick={() => toggleParticipant(u.id)}
            >
              <span className={"checkbox" + (checked ? " checked" : "")} />
              {u.name} — {u.role}
            </button>
          );
        })}
      </div>
      <div className="admin-form-actions">
        <button type="button" className="btn primary" onClick={submit} disabled={saving}>
          {saving ? "Creating…" : "Create meeting"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- Calendar view ----------

function MeetingsCalendar({
  mySeries,
  monthOffset,
  setMonthOffset,
  onOpen,
  onSwitchView,
}: {
  mySeries: SeriesData[];
  monthOffset: number;
  setMonthOffset: (fn: (n: number) => number) => void;
  onOpen: (seriesId: string, instanceId: string) => void;
  onSwitchView: () => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const today = new Date();
  const ref = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const byDate = new Map<string, { series: SeriesData; instanceId: string; date: Date }[]>();
  mySeries.forEach((s) => {
    s.instances.forEach((inst) => {
      const d = new Date(inst.startsAt);
      const key = d.toISOString().slice(0, 10);
      const arr = byDate.get(key) ?? [];
      arr.push({ series: s, instanceId: inst.id, date: d });
      byDate.set(key, arr);
    });
  });

  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const todayKey = today.toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const cellDate = new Date(year, month, dayNum);
    const key = cellDate.toISOString().slice(0, 10);
    const dayMeetings = (byDate.get(key) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    const expanded = expandedKey === key;
    const shown = expanded ? dayMeetings : dayMeetings.slice(0, 3);
    cells.push(
      <div key={i} className={"cal-cell" + (inMonth ? "" : " out") + (key === todayKey ? " today" : "")}>
        <div className="cal-daynum">{inMonth ? dayNum : ""}</div>
        {shown.map((m) => (
          <button
            key={m.instanceId}
            className="cal-pill"
            style={{
              background: `color-mix(in srgb, var(--${m.series.color}) 16%, transparent)`,
              color: `var(--${m.series.color})`,
            }}
            title={`${m.series.name} — ${fmtTime(m.date)}`}
            onClick={() => onOpen(m.series.id, m.instanceId)}
          >
            {fmtTime(m.date)} {m.series.name.replace("1-on-1: Tim & ", "")}
          </button>
        ))}
        {dayMeetings.length > 3 && (
          <button type="button" className="cal-more" onClick={() => setExpandedKey(expanded ? null : key)}>
            {expanded ? "Show less" : `+${dayMeetings.length - 3} more`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="panel-toolbar">
        <div className="filter-row">
          <button className="filter-chip active">Calendar</button>
          <button className="filter-chip" onClick={onSwitchView}>
            List
          </button>
        </div>
        <div className="cal-nav">
          <button className="btn" onClick={() => setMonthOffset((n) => n - 1)}>
            &lsaquo;
          </button>
          <span className="cal-month-label">{monthLabel(year, month)}</span>
          <button className="btn" onClick={() => setMonthOffset((n) => n + 1)}>
            &rsaquo;
          </button>
        </div>
      </div>
      <div className="card cal-grid-wrap">
        <div className="cal-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cal-grid">{cells}</div>
      </div>
    </div>
  );
}

function MeetingsList({
  mySeries,
  zoomLink,
  userById,
  pendingCount,
  onOpen,
  onSwitchView,
}: {
  mySeries: SeriesData[];
  zoomLink: string;
  userById: (id: string | null) => UserLite | undefined;
  pendingCount: (instance: { agendaItems: AgendaItemData[] }) => number;
  onOpen: (seriesId: string, instanceId: string) => void;
  onSwitchView: () => void;
}) {
  const oneOnOnes = mySeries.filter((s) => s.type === "ONE_ON_ONE");
  const others = mySeries.filter((s) => s.type !== "ONE_ON_ONE");

  return (
    <div>
      <div className="panel-toolbar">
        <div className="filter-row">
          <button className="filter-chip" onClick={onSwitchView}>
            Calendar
          </button>
          <button className="filter-chip active">List</button>
        </div>
      </div>

      <div className="section-label">1-on-1s</div>
      {oneOnOnes.length === 0 && <div className="card empty-state">None scheduled.</div>}
      {oneOnOnes.map((s) => {
        const inst = nextInstance(s);
        if (!inst) return null;
        return (
          <MeetingCard
            key={s.id}
            series={s}
            instance={inst}
            zoomLink={zoomLink}
            userById={userById}
            pending={pendingCount(inst)}
            onClick={() => onOpen(s.id, inst.id)}
          />
        );
      })}

      <div className="section-label">Team &amp; ownership meetings</div>
      {others.length === 0 && <div className="card empty-state">None scheduled.</div>}
      {others.map((s) => {
        const inst = nextInstance(s);
        if (!inst) return null;
        return (
          <MeetingCard
            key={s.id}
            series={s}
            instance={inst}
            zoomLink={zoomLink}
            userById={userById}
            pending={pendingCount(inst)}
            onClick={() => onOpen(s.id, inst.id)}
          />
        );
      })}
    </div>
  );
}

// ---------- Live meeting ----------

function LiveMeeting({
  series,
  instance,
  zoomLink,
  userById,
  onBack,
  onToggleDiscussed,
  onSaveNotes,
  onAddAgendaItem,
  onTable,
  onDelete,
  onDeleteMeeting,
  openTaskFormFor,
  setOpenTaskFormFor,
  onCreateTask,
  allUsers,
  tasksById,
  isAdmin,
  attendance,
  onMarkAttendance,
}: {
  series: SeriesData;
  instance: { id: string; startsAt: string; agendaItems: AgendaItemData[] };
  zoomLink: string;
  userById: (id: string | null) => UserLite | undefined;
  onBack: () => void;
  onToggleDiscussed: (item: AgendaItemData) => void;
  onSaveNotes: (item: AgendaItemData, notes: string) => void;
  onAddAgendaItem: (title: string) => void;
  onTable: (item: AgendaItemData) => void;
  onDelete: (item: AgendaItemData) => void;
  onDeleteMeeting: () => Promise<void>;
  openTaskFormFor: string | null;
  setOpenTaskFormFor: (id: string | null) => void;
  onCreateTask: (item: AgendaItemData, title: string, assigneeId: string, dueDate: string) => void;
  allUsers: UserLite[];
  tasksById: (id: string) => TaskData | undefined;
  isAdmin: boolean;
  attendance: AttendanceRow[];
  onMarkAttendance: (userId: string, patch: Partial<Pick<AttendanceRow, "status" | "prepared" | "focused">>) => void;
}) {
  const date = new Date(instance.startsAt);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [confirmingDeleteMeeting, setConfirmingDeleteMeeting] = useState(false);
  const [deletingMeeting, setDeletingMeeting] = useState(false);

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        &lsaquo; Back to meetings
      </button>
      <div className="meeting-header">
        <div>
          <h1 className="page-title">{series.name}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {fmtDate(date)} · {fmtTime(date)} · {series.durationMins} min
          </p>
          <div className="participants">
            {series.participantIds.map((id) => {
              const u = userById(id);
              if (!u) return null;
              return (
                <span key={id} className="avatar-chip">
                  {u.initials} {u.name.split(" ")[0]}
                </span>
              );
            })}
          </div>
        </div>
        <div className="meeting-header-actions">
          <a className="btn primary zoom-btn" href={zoomLink} target="_blank" rel="noopener">
            Join Zoom Meeting
          </a>
          {!confirmingDeleteMeeting ? (
            <button className="btn ghost-danger" onClick={() => setConfirmingDeleteMeeting(true)}>
              Delete meeting
            </button>
          ) : (
            <span className="delete-meeting-confirm">
              <span className="owner-chip">Delete this meeting?</span>
              <button
                className="btn ghost-danger"
                disabled={deletingMeeting}
                onClick={async () => {
                  setDeletingMeeting(true);
                  try {
                    await onDeleteMeeting();
                  } catch {
                    setDeletingMeeting(false);
                  }
                }}
              >
                {deletingMeeting ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="btn" disabled={deletingMeeting} onClick={() => setConfirmingDeleteMeeting(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <AttendancePanel
          series={series}
          userById={userById}
          attendance={attendance}
          onMark={onMarkAttendance}
        />
      )}

      <div className="section-label">Agenda</div>
      <div>
        {instance.agendaItems.length === 0 && (
          <div className="card empty-state">No agenda items yet — add the first one below.</div>
        )}
        {instance.agendaItems.map((a) => (
          <AgendaItemCard
            key={a.id}
            item={a}
            userById={userById}
            onToggleDiscussed={onToggleDiscussed}
            onSaveNotes={onSaveNotes}
            onTable={onTable}
            onDelete={onDelete}
            showTaskForm={openTaskFormFor === a.id}
            onToggleTaskForm={() => setOpenTaskFormFor(openTaskFormFor === a.id ? null : a.id)}
            onCreateTask={onCreateTask}
            allUsers={allUsers}
            tasksById={tasksById}
          />
        ))}
      </div>

      <div className="add-row">
        <input
          type="text"
          placeholder="Add an agenda item…"
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItemTitle.trim()) {
              onAddAgendaItem(newItemTitle.trim());
              setNewItemTitle("");
            }
          }}
        />
        <button
          className="btn primary"
          onClick={() => {
            if (newItemTitle.trim()) {
              onAddAgendaItem(newItemTitle.trim());
              setNewItemTitle("");
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------- Meeting Efficiency (admin-only attendance panel) ----------

const STATUS_OPTIONS: { value: "PRESENT" | "LATE" | "ABSENT"; label: string }[] = [
  { value: "PRESENT", label: "On time" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "No-show" },
];

function AttendancePanel({
  series,
  userById,
  attendance,
  onMark,
}: {
  series: SeriesData;
  userById: (id: string | null) => UserLite | undefined;
  attendance: AttendanceRow[];
  onMark: (userId: string, patch: Partial<Pick<AttendanceRow, "status" | "prepared" | "focused">>) => void;
}) {
  const rowFor = (userId: string): AttendanceRow =>
    attendance.find((a) => a.userId === userId) ?? { userId, status: null, prepared: null, focused: null };

  return (
    <div className="card attendance-panel">
      <div className="attendance-panel-header">
        <div className="mini-label">Meeting Efficiency</div>
        <span className="owner-chip">Admin only — mark who showed up, prepared, and stayed focused.</span>
      </div>
      {series.participantIds.map((id) => {
        const u = userById(id);
        if (!u) return null;
        const row = rowFor(id);
        return (
          <div key={id} className="attendance-row">
            <span className="avatar-chip">
              {u.initials} {u.name.split(" ")[0]}
            </span>
            <div className="attendance-controls">
              <div className="attendance-chip-group">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={"attendance-chip" + (row.status === opt.value ? " active" : "")}
                    onClick={() => onMark(id, { status: row.status === opt.value ? null : opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="attendance-chip-group">
                <button
                  type="button"
                  className={"attendance-chip" + (row.prepared === true ? " active" : "")}
                  onClick={() => onMark(id, { prepared: row.prepared === true ? null : true })}
                >
                  Prepared
                </button>
                <button
                  type="button"
                  className={"attendance-chip warn" + (row.prepared === false ? " active" : "")}
                  onClick={() => onMark(id, { prepared: row.prepared === false ? null : false })}
                >
                  Unprepared
                </button>
              </div>
              <div className="attendance-chip-group">
                <button
                  type="button"
                  className={"attendance-chip" + (row.focused === true ? " active" : "")}
                  onClick={() => onMark(id, { focused: row.focused === true ? null : true })}
                >
                  Focused
                </button>
                <button
                  type="button"
                  className={"attendance-chip warn" + (row.focused === false ? " active" : "")}
                  onClick={() => onMark(id, { focused: row.focused === false ? null : false })}
                >
                  Distracted
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaItemCard({
  item,
  userById,
  onToggleDiscussed,
  onSaveNotes,
  onTable,
  onDelete,
  showTaskForm,
  onToggleTaskForm,
  onCreateTask,
  allUsers,
  tasksById,
}: {
  item: AgendaItemData;
  userById: (id: string | null) => UserLite | undefined;
  onToggleDiscussed: (item: AgendaItemData) => void;
  onSaveNotes: (item: AgendaItemData, notes: string) => void;
  onTable: (item: AgendaItemData) => void;
  onDelete: (item: AgendaItemData) => void;
  showTaskForm: boolean;
  onToggleTaskForm: () => void;
  onCreateTask: (item: AgendaItemData, title: string, assigneeId: string, dueDate: string) => void;
  allUsers: UserLite[];
  tasksById: (id: string) => TaskData | undefined;
}) {
  const [notes, setNotes] = useState(item.notes);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const addedBy = userById(item.addedById);
  const linkedTasks = item.taskIds.map(tasksById).filter(Boolean) as TaskData[];

  useAutosave(notes, (n) => onSaveNotes(item, n));

  return (
    <div className={"agenda-item" + (item.discussed ? " discussed" : "")}>
      <div className="ai-row">
        <button
          className={"checkbox" + (item.discussed ? " checked" : "")}
          onClick={() => onToggleDiscussed(item)}
          aria-label="Mark discussed"
        />
        <div className="ai-body">
          <div className={"ai-title" + (item.discussed ? " strike" : "")}>{item.title}</div>
          <div className="ai-meta">
            Added by {addedBy?.name.split(" ")[0] ?? "—"}
            {item.tabled ? " · tabled from a previous meeting" : ""}
          </div>

          <textarea
            className="ai-notes"
            placeholder="Notes from the discussion…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {linkedTasks.map((lt) => (
            <div key={lt.id} className="task-chip">
              → Task: {lt.title} ({userById(lt.assigneeId)?.name.split(" ")[0] ?? "Unassigned"},{" "}
              {lt.dueDate ? fmtDueDate(new Date(lt.dueDate)) : "no due date"})
            </div>
          ))}

          <div className="ai-actions">
            <button className="btn" onClick={onToggleTaskForm}>
              + Create task{linkedTasks.length ? " (add another)" : ""}
            </button>
            <button className="btn ghost-danger" onClick={() => onTable(item)}>
              Table to next meeting
            </button>
            {!confirmingDelete ? (
              <button className="btn ghost-danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            ) : (
              <>
                <span className="owner-chip">Delete this agenda item?</span>
                <button className="btn ghost-danger" onClick={() => onDelete(item)}>
                  Yes, delete
                </button>
                <button className="btn" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {showTaskForm && (
            <TaskForm
              defaultTitle={item.title}
              allUsers={allUsers}
              onCancel={onToggleTaskForm}
              onSave={(title, assigneeId, dueDate) => onCreateTask(item, title, assigneeId, dueDate)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TaskForm({
  defaultTitle,
  allUsers,
  onCancel,
  onSave,
}: {
  defaultTitle: string;
  allUsers: UserLite[];
  onCancel: () => void;
  onSave: (title: string, assigneeId: string, dueDate: string) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [owner, setOwner] = useState(allUsers[0]?.id ?? "");
  const [due, setDue] = useState(defaultDueDateInput());

  return (
    <div className="inline-form">
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      <select value={owner} onChange={(e) => setOwner(e.target.value)}>
        {allUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <button
        className="btn primary"
        onClick={() => {
          if (title.trim()) onSave(title.trim(), owner, due);
        }}
      >
        Create
      </button>
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
