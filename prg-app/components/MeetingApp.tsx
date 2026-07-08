"use client";

import { useState } from "react";
import type {
  AgendaItemData,
  GoalData,
  MeetingManagementData,
  SeriesData,
  TaskData,
  UserLite,
} from "@/lib/meeting-types";

// ---------- small formatting helpers ----------

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDueDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

function daysUntil(due: Date | null) {
  if (!due) return null;
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function dueStatus(due: Date | null, done: boolean) {
  if (done) return "good";
  const d = daysUntil(due);
  if (d === null) return "good";
  if (d < 0) return "crit";
  if (d <= 3) return "warn";
  return "good";
}
function dueLabel(due: Date | null, done: boolean) {
  if (done) return "Done";
  if (!due) return "No due date";
  const d = daysUntil(due)!;
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `Due ${fmtDueDate(due)}`;
}

const GOAL_STATUS_LABEL: Record<string, string> = { GOOD: "On track", WARN: "At risk", CRIT: "Behind" };
const GOAL_STATUS_CYCLE: Record<string, "GOOD" | "WARN" | "CRIT"> = { GOOD: "WARN", WARN: "CRIT", CRIT: "GOOD" };
const GOAL_STATUS_CLASS: Record<string, string> = { GOOD: "good", WARN: "warn", CRIT: "crit" };

async function apiJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ---------- component ----------

type OpenMeeting = { seriesId: string; instanceId: string } | null;

export default function MeetingApp({
  initialData,
  currentUserId,
  zoomLink,
  initialOpenInstanceId,
}: {
  initialData: MeetingManagementData;
  currentUserId: string;
  zoomLink: string;
  initialOpenInstanceId: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [currentUser] = useState(currentUserId);
  const [subTab, setSubTab] = useState<"calendar" | "todos" | "goals">("calendar");
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

  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "overdue">("all");
  const [taskEmployeeFilter, setTaskEmployeeFilter] = useState<string>("all");
  const [goalEmployeeFilter, setGoalEmployeeFilter] = useState<string>("all");

  const userById = (id: string | null): UserLite | undefined =>
    id ? data.users.find((u) => u.id === id) : undefined;
  const seriesById = (id: string) => data.series.find((s) => s.id === id);
  const firstName = (id: string | null) => userById(id)?.name.split(" ")[0] ?? "—";

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
      // ensure destination instance exists in series
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

  const [openTaskFormFor, setOpenTaskFormFor] = useState<string | null>(null);

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
          dueDate: task.dueDate,
          assigneeId: task.assigneeId,
          agendaItemId: item.id,
          meetingRefs: [],
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

  async function addStandaloneTask(title: string, assigneeId: string, dueDate: string) {
    const { task } = await apiJson("/api/tasks", "POST", { title, assigneeId, dueDate });
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id: task.id,
          title: task.title,
          notes: "",
          done: false,
          dueDate: task.dueDate,
          assigneeId: task.assigneeId,
          agendaItemId: null,
          meetingRefs: [],
        },
      ],
    }));
  }

  async function toggleTaskDone(task: TaskData) {
    const next = !task.done;
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done: next } : t)) }));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { done: next }).catch(() => {});
  }

  async function saveTaskNotes(task: TaskData, notes: string) {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, notes } : t)) }));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { notes }).catch(() => {});
  }

  async function addStandaloneGoal(title: string, assigneeId: string, dueDate: string) {
    const { goal } = await apiJson("/api/goals", "POST", { title, assigneeId, dueDate });
    setData((d) => ({
      ...d,
      goals: [
        ...d.goals,
        {
          id: goal.id,
          title: goal.title,
          notes: "",
          status: "GOOD",
          dueDate: goal.dueDate,
          assigneeId: goal.assigneeId,
          meetingRefs: [],
        },
      ],
    }));
  }

  async function cycleGoalStatus(goal: GoalData) {
    const next = GOAL_STATUS_CYCLE[goal.status];
    setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === goal.id ? { ...g, status: next } : g)) }));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { status: next }).catch(() => {});
  }

  async function saveGoalNotes(goal: GoalData, notes: string) {
    setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === goal.id ? { ...g, notes } : g)) }));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { notes }).catch(() => {});
  }

  async function addToMeeting(kind: "task" | "goal", id: string, seriesId: string) {
    const { agendaItem } = await apiJson(`/api/${kind}s/${id}/meeting-refs`, "POST", { seriesId });
    const ref = {
      agendaItemId: agendaItem.id,
      seriesId: agendaItem.instance.series.id,
      seriesName: agendaItem.instance.series.name,
      instanceId: agendaItem.instanceId,
      startsAt: agendaItem.instance.startsAt,
    };
    setData((d) => {
      const series = d.series.map((s) => {
        if (s.id !== ref.seriesId) return s;
        const hasInstance = s.instances.some((i) => i.id === ref.instanceId);
        const instances = hasInstance
          ? s.instances
          : [...s.instances, { id: ref.instanceId, seriesId: ref.seriesId, startsAt: ref.startsAt, agendaItems: [] }];
        return {
          ...s,
          instances: instances.map((inst) =>
            inst.id === ref.instanceId
              ? {
                  ...inst,
                  agendaItems: [
                    ...inst.agendaItems,
                    {
                      id: agendaItem.id,
                      instanceId: ref.instanceId,
                      title: agendaItem.title,
                      discussed: false,
                      notes: "",
                      tabled: false,
                      addedById: agendaItem.addedById,
                      sourceType: kind,
                      sourceTaskId: kind === "task" ? id : null,
                      sourceGoalId: kind === "goal" ? id : null,
                      taskIds: [],
                    },
                  ],
                }
              : inst
          ),
        };
      });
      if (kind === "task") {
        return {
          ...d,
          series,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, meetingRefs: [...t.meetingRefs, ref] } : t)),
        };
      }
      return {
        ...d,
        series,
        goals: d.goals.map((g) => (g.id === id ? { ...g, meetingRefs: [...g.meetingRefs, ref] } : g)),
      };
    });
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
          currentUser={currentUser}
          onBack={() => setOpenMeeting(null)}
          onToggleDiscussed={toggleDiscussed}
          onSaveNotes={saveAgendaNotes}
          onAddAgendaItem={(title) => addAgendaItem(instance.id, title)}
          onTable={tableToNextMeeting}
          openTaskFormFor={openTaskFormFor}
          setOpenTaskFormFor={setOpenTaskFormFor}
          onCreateTask={createTaskFromAgendaItem}
          allUsers={data.users}
          tasksById={(id) => data.tasks.find((t) => t.id === id)}
        />
      );
    }
  }

  return (
    <div>
      <h1 className="page-title">Meeting Management</h1>
      <p className="page-sub">Leadership &amp; team meetings, 1-on-1s, to-dos, and goals.</p>

      <div className="subnav">
        {[
          { id: "calendar", label: "Calendar" },
          { id: "todos", label: "To-Dos" },
          { id: "goals", label: "Goals" },
        ].map((t) => (
          <button
            key={t.id}
            className={"subnav-item" + (subTab === t.id ? " active" : "")}
            onClick={() => setSubTab(t.id as typeof subTab)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "calendar" &&
        (calendarViewMode === "list" ? (
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
        ))}

      {subTab === "todos" && (
        <Todos
          tasks={data.tasks}
          users={data.users}
          currentUser={currentUser}
          userById={userById}
          taskFilter={taskFilter}
          setTaskFilter={setTaskFilter}
          taskEmployeeFilter={taskEmployeeFilter}
          setTaskEmployeeFilter={setTaskEmployeeFilter}
          onToggleDone={toggleTaskDone}
          onSaveNotes={saveTaskNotes}
          onAddTask={addStandaloneTask}
          onAddToMeeting={addToMeeting}
          mySeries={seriesForUser(currentUser)}
        />
      )}

      {subTab === "goals" && (
        <Goals
          goals={data.goals}
          users={data.users}
          currentUser={currentUser}
          userById={userById}
          goalEmployeeFilter={goalEmployeeFilter}
          setGoalEmployeeFilter={setGoalEmployeeFilter}
          onCycleStatus={cycleGoalStatus}
          onSaveNotes={saveGoalNotes}
          onAddGoal={addStandaloneGoal}
          onAddToMeeting={addToMeeting}
          mySeries={seriesForUser(currentUser)}
        />
      )}
    </div>
  );
}

// ---------- Meeting card (shared by list/calendar/home-ish views) ----------

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
    cells.push(
      <div key={i} className={"cal-cell" + (inMonth ? "" : " out") + (key === todayKey ? " today" : "")}>
        <div className="cal-daynum">{inMonth ? dayNum : ""}</div>
        {dayMeetings.slice(0, 3).map((m) => (
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
        {dayMeetings.length > 3 && <div className="cal-more">+{dayMeetings.length - 3} more</div>}
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
  currentUser,
  onBack,
  onToggleDiscussed,
  onSaveNotes,
  onAddAgendaItem,
  onTable,
  openTaskFormFor,
  setOpenTaskFormFor,
  onCreateTask,
  allUsers,
  tasksById,
}: {
  series: SeriesData;
  instance: { id: string; startsAt: string; agendaItems: AgendaItemData[] };
  zoomLink: string;
  userById: (id: string | null) => UserLite | undefined;
  currentUser: string;
  onBack: () => void;
  onToggleDiscussed: (item: AgendaItemData) => void;
  onSaveNotes: (item: AgendaItemData, notes: string) => void;
  onAddAgendaItem: (title: string) => void;
  onTable: (item: AgendaItemData) => void;
  openTaskFormFor: string | null;
  setOpenTaskFormFor: (id: string | null) => void;
  onCreateTask: (item: AgendaItemData, title: string, assigneeId: string, dueDate: string) => void;
  allUsers: UserLite[];
  tasksById: (id: string) => TaskData | undefined;
}) {
  const date = new Date(instance.startsAt);
  const [newItemTitle, setNewItemTitle] = useState("");

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
        <a className="btn primary zoom-btn" href={zoomLink} target="_blank" rel="noopener">
          Join Zoom Meeting
        </a>
      </div>

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

function AgendaItemCard({
  item,
  userById,
  onToggleDiscussed,
  onSaveNotes,
  onTable,
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
  showTaskForm: boolean;
  onToggleTaskForm: () => void;
  onCreateTask: (item: AgendaItemData, title: string, assigneeId: string, dueDate: string) => void;
  allUsers: UserLite[];
  tasksById: (id: string) => TaskData | undefined;
}) {
  const [notes, setNotes] = useState(item.notes);
  const addedBy = userById(item.addedById);
  const linkedTasks = item.taskIds.map(tasksById).filter(Boolean) as TaskData[];

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
          <div className="ai-actions">
            <button className="btn" onClick={() => onSaveNotes(item, notes)}>
              Save note
            </button>
            {notes.trim() && <span className="saved-tag">✓ Saved</span>}
          </div>

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

function defaultDueDateInput() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// ---------- To-Dos ----------

function Todos({
  tasks,
  users,
  currentUser,
  userById,
  taskFilter,
  setTaskFilter,
  taskEmployeeFilter,
  setTaskEmployeeFilter,
  onToggleDone,
  onSaveNotes,
  onAddTask,
  onAddToMeeting,
  mySeries,
}: {
  tasks: TaskData[];
  users: UserLite[];
  currentUser: string;
  userById: (id: string | null) => UserLite | undefined;
  taskFilter: "all" | "open" | "overdue";
  setTaskFilter: (f: "all" | "open" | "overdue") => void;
  taskEmployeeFilter: string;
  setTaskEmployeeFilter: (v: string) => void;
  onToggleDone: (task: TaskData) => void;
  onSaveNotes: (task: TaskData, notes: string) => void;
  onAddTask: (title: string, assigneeId: string, dueDate: string) => void;
  onAddToMeeting: (kind: "task" | "goal", id: string, seriesId: string) => void;
  mySeries: SeriesData[];
}) {
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState(users[0]?.id ?? "");
  const [newDue, setNewDue] = useState(defaultDueDateInput());

  let list = tasks.slice();
  if (taskFilter === "open") list = list.filter((t) => !t.done);
  if (taskFilter === "overdue")
    list = list.filter((t) => !t.done && (daysUntil(t.dueDate ? new Date(t.dueDate) : null) ?? 0) < 0);
  if (taskEmployeeFilter === "mine") list = list.filter((t) => t.assigneeId === currentUser);
  else if (taskEmployeeFilter !== "all") list = list.filter((t) => t.assigneeId === taskEmployeeFilter);

  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div>
      <p className="page-sub" style={{ marginTop: -6 }}>
        Tasks either created directly or spun off from a meeting agenda item. Click a task to add or read
        notes.
      </p>

      <div className="panel-toolbar">
        <div className="filter-row">
          {(["all", "open", "overdue"] as const).map((f) => (
            <button
              key={f}
              className={"filter-chip" + (taskFilter === f ? " active" : "")}
              onClick={() => setTaskFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center", marginRight: 2 }}>
            Employee
          </label>
          <select value={taskEmployeeFilter} onChange={(e) => setTaskEmployeeFilter(e.target.value)}>
            <option value="all">All employees</option>
            <option value="mine">Mine ({firstNameOf(userById(currentUser))})</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <table className="list-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>Task</th>
              <th>Owner</th>
              <th>Status</th>
              <th style={{ width: 70 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
                  No tasks match this filter.
                </td>
              </tr>
            )}
            {list.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                userById={userById}
                open={openNotesFor === t.id}
                onToggleOpen={() => setOpenNotesFor(openNotesFor === t.id ? null : t.id)}
                onToggleDone={() => onToggleDone(t)}
                onSaveNotes={(notes) => onSaveNotes(t, notes)}
                onAddToMeeting={(seriesId) => onAddToMeeting("task", t.id, seriesId)}
                mySeries={mySeries}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="add-row">
        <input
          type="text"
          placeholder="New task title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        <button
          className="btn primary"
          onClick={() => {
            if (newTitle.trim()) {
              onAddTask(newTitle.trim(), newOwner, newDue);
              setNewTitle("");
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function firstNameOf(u: UserLite | undefined) {
  return u ? u.name.split(" ")[0] : "";
}

function TaskRow({
  task,
  userById,
  open,
  onToggleOpen,
  onToggleDone,
  onSaveNotes,
  onAddToMeeting,
  mySeries,
}: {
  task: TaskData;
  userById: (id: string | null) => UserLite | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onSaveNotes: (notes: string) => void;
  onAddToMeeting: (seriesId: string) => void;
  mySeries: SeriesData[];
}) {
  const [notes, setNotes] = useState(task.notes);
  const hasNotes = task.notes.trim().length > 0;
  const due = task.dueDate ? new Date(task.dueDate) : null;

  return (
    <>
      <tr>
        <td>
          <button className={"checkbox" + (task.done ? " checked" : "")} onClick={onToggleDone} aria-label="Toggle done" />
        </td>
        <td className={task.done ? "strike-text" : ""}>
          {task.title}
          {task.agendaItemId && (
            <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}> · from meeting</span>
          )}
        </td>
        <td className="owner-chip">{userById(task.assigneeId)?.name ?? "Unassigned"}</td>
        <td>
          <span className={"status-badge " + dueStatus(due, task.done)}>{dueLabel(due, task.done)}</span>
        </td>
        <td>
          <button className="btn" onClick={onToggleOpen}>
            {open ? "Close" : hasNotes ? "View" : "+ Add"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={4} style={{ paddingTop: 0 }}>
            <div className="detail-panel">
              <div className="mini-label">Notes</div>
              <textarea
                className="ai-notes"
                placeholder="Notes on this task…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="ai-actions">
                <button className="btn" onClick={() => onSaveNotes(notes)}>
                  Save note
                </button>
                {notes.trim() && <span className="saved-tag">✓ Saved</span>}
              </div>

              <div className="mini-label">Meetings</div>
              <MeetingRefs refs={task.meetingRefs} />
              <AddToMeeting mySeries={mySeries} onAdd={onAddToMeeting} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MeetingRefs({ refs }: { refs: TaskData["meetingRefs"] }) {
  if (!refs.length) return null;
  return (
    <>
      {refs.map((r) => (
        <span key={r.agendaItemId} className="meeting-ref-chip">
          → On agenda: {r.seriesName} ({fmtDate(new Date(r.startsAt))})
        </span>
      ))}
    </>
  );
}

function AddToMeeting({
  mySeries,
  onAdd,
}: {
  mySeries: SeriesData[];
  onAdd: (seriesId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seriesId, setSeriesId] = useState(mySeries[0]?.id ?? "");

  if (!mySeries.length) return null;

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Add to meeting
      </button>
    );
  }

  return (
    <div className="inline-form">
      <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
        {mySeries.map((s) => {
          const inst = nextInstance(s);
          return (
            <option key={s.id} value={s.id}>
              {s.name} — next: {inst ? fmtDate(new Date(inst.startsAt)) : "—"}
            </option>
          );
        })}
      </select>
      <button
        className="btn primary"
        onClick={() => {
          onAdd(seriesId);
          setOpen(false);
        }}
      >
        Add
      </button>
      <button className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

// ---------- Goals ----------

function Goals({
  goals,
  users,
  currentUser,
  userById,
  goalEmployeeFilter,
  setGoalEmployeeFilter,
  onCycleStatus,
  onSaveNotes,
  onAddGoal,
  onAddToMeeting,
  mySeries,
}: {
  goals: GoalData[];
  users: UserLite[];
  currentUser: string;
  userById: (id: string | null) => UserLite | undefined;
  goalEmployeeFilter: string;
  setGoalEmployeeFilter: (v: string) => void;
  onCycleStatus: (goal: GoalData) => void;
  onSaveNotes: (goal: GoalData, notes: string) => void;
  onAddGoal: (title: string, assigneeId: string, dueDate: string) => void;
  onAddToMeeting: (kind: "task" | "goal", id: string, seriesId: string) => void;
  mySeries: SeriesData[];
}) {
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState(users[0]?.id ?? "");
  const [newDue, setNewDue] = useState(defaultDueDateInput());

  let list = goals.slice();
  if (goalEmployeeFilter === "mine") list = list.filter((g) => g.assigneeId === currentUser);
  else if (goalEmployeeFilter !== "all") list = list.filter((g) => g.assigneeId === goalEmployeeFilter);

  return (
    <div>
      <p className="page-sub" style={{ marginTop: -6 }}>
        Longer-horizon goals, owned by a person, tracked to a target date.
      </p>
      <div className="proto-banner" style={{ marginBottom: 20 }}>
        <b>How status works:</b> it&apos;s a judgment call the goal&apos;s <b>owner</b> makes — not
        calculated automatically from the due date. Click a status badge below to cycle it (On track →
        At risk → Behind), the same way you&apos;d update it yourself during a 1-on-1 or the ownership
        meeting.
      </div>

      <div className="panel-toolbar">
        <div className="filter-row">
          <label style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center", marginRight: 2 }}>
            Employee
          </label>
          <select value={goalEmployeeFilter} onChange={(e) => setGoalEmployeeFilter(e.target.value)}>
            <option value="all">All employees</option>
            <option value="mine">Mine ({firstNameOf(userById(currentUser))})</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <table className="list-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Owner</th>
              <th>Target</th>
              <th>Status</th>
              <th style={{ width: 70 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
                  No goals match this filter.
                </td>
              </tr>
            )}
            {list.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                userById={userById}
                open={openNotesFor === g.id}
                onToggleOpen={() => setOpenNotesFor(openNotesFor === g.id ? null : g.id)}
                onCycleStatus={() => onCycleStatus(g)}
                onSaveNotes={(notes) => onSaveNotes(g, notes)}
                onAddToMeeting={(seriesId) => onAddToMeeting("goal", g.id, seriesId)}
                mySeries={mySeries}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="add-row">
        <input
          type="text"
          placeholder="New goal…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        <button
          className="btn primary"
          onClick={() => {
            if (newTitle.trim()) {
              onAddGoal(newTitle.trim(), newOwner, newDue);
              setNewTitle("");
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  userById,
  open,
  onToggleOpen,
  onCycleStatus,
  onSaveNotes,
  onAddToMeeting,
  mySeries,
}: {
  goal: GoalData;
  userById: (id: string | null) => UserLite | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onCycleStatus: () => void;
  onSaveNotes: (notes: string) => void;
  onAddToMeeting: (seriesId: string) => void;
  mySeries: SeriesData[];
}) {
  const [notes, setNotes] = useState(goal.notes);
  const hasNotes = goal.notes.trim().length > 0;

  return (
    <>
      <tr>
        <td>{goal.title}</td>
        <td className="owner-chip">{userById(goal.assigneeId)?.name ?? "Unassigned"}</td>
        <td>{goal.dueDate ? fmtDueDate(new Date(goal.dueDate)) : "No target"}</td>
        <td>
          <button
            className={"status-badge " + GOAL_STATUS_CLASS[goal.status]}
            onClick={onCycleStatus}
            title="Click to update status"
          >
            {GOAL_STATUS_LABEL[goal.status]}
          </button>
        </td>
        <td>
          <button className="btn" onClick={onToggleOpen}>
            {open ? "Close" : hasNotes ? "View" : "+ Add"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={4} style={{ paddingTop: 0 }}>
            <div className="detail-panel">
              <div className="mini-label">Notes</div>
              <textarea
                className="ai-notes"
                placeholder="Notes on this goal…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="ai-actions">
                <button className="btn" onClick={() => onSaveNotes(notes)}>
                  Save note
                </button>
                {notes.trim() && <span className="saved-tag">✓ Saved</span>}
              </div>

              <div className="mini-label">Meetings</div>
              <MeetingRefs refs={goal.meetingRefs} />
              <AddToMeeting mySeries={mySeries} onAdd={onAddToMeeting} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
