"use client";

import { useState } from "react";
import type { SeriesData, TaskData, UserLite } from "@/lib/meeting-types";
import {
  apiJson,
  daysUntil,
  defaultDueDateInput,
  dueLabel,
  dueStatus,
  firstNameOf,
  fmtDate,
  isoDateOnly,
  nextInstance,
  useAutosave,
} from "@/lib/meeting-client-utils";

type TaskFilter = "all" | "open" | "overdue" | "archived";

export default function TodosApp({
  initialTasks,
  users,
  currentUserId,
  series,
}: {
  initialTasks: TaskData[];
  users: UserLite[];
  currentUserId: string;
  series: SeriesData[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [taskEmployeeFilter, setTaskEmployeeFilter] = useState<string>("all");
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState(users[0]?.id ?? "");
  const [newDue, setNewDue] = useState(defaultDueDateInput());

  const userById = (id: string | null) => (id ? users.find((u) => u.id === id) : undefined);
  const mySeries = series.filter((s) => s.participantIds.includes(currentUserId));

  async function toggleDone(task: TaskData) {
    const next = !task.done;
    setTasks((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, done: next, archived: next } : t))
    );
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { done: next }).catch(() => {});
  }

  async function saveNotes(task: TaskData, notes: string) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, notes } : t)));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { notes }).catch(() => {});
  }

  async function setArchived(task: TaskData, archived: boolean) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, archived } : t)));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { archived }).catch(() => {});
  }

  async function changeAssignee(task: TaskData, assigneeId: string) {
    const nextId = assigneeId || null;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, assigneeId: nextId } : t)));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { assigneeId: nextId }).catch(() => {});
  }

  async function changeDueDate(task: TaskData, dueDate: string) {
    const iso = dueDate ? new Date(`${dueDate}T00:00:00Z`).toISOString() : null;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, dueDate: iso } : t)));
    await apiJson(`/api/tasks/${task.id}`, "PATCH", { dueDate: dueDate || null }).catch(() => {});
  }

  async function addTask(title: string, assigneeId: string, dueDate: string) {
    const { task } = await apiJson("/api/tasks", "POST", { title, assigneeId, dueDate });
    setTasks((ts) => [
      ...ts,
      {
        id: task.id,
        title: task.title,
        notes: "",
        done: false,
        archived: false,
        dueDate: task.dueDate,
        assigneeId: task.assigneeId,
        agendaItemId: null,
        meetingRefs: [],
        goalId: null,
        goalTitle: null,
      },
    ]);
  }

  async function addToMeeting(task: TaskData, seriesId: string) {
    const { agendaItem } = await apiJson(`/api/tasks/${task.id}/meeting-refs`, "POST", { seriesId });
    const ref = {
      agendaItemId: agendaItem.id,
      seriesId: agendaItem.instance.series.id,
      seriesName: agendaItem.instance.series.name,
      instanceId: agendaItem.instanceId,
      startsAt: agendaItem.instance.startsAt,
    };
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, meetingRefs: [...t.meetingRefs, ref] } : t)));
  }

  let list = tasks.slice();
  if (taskFilter === "archived") {
    list = list.filter((t) => t.archived);
  } else {
    list = list.filter((t) => !t.archived);
    if (taskFilter === "open") list = list.filter((t) => !t.done);
    if (taskFilter === "overdue")
      list = list.filter((t) => !t.done && (daysUntil(t.dueDate ? new Date(t.dueDate) : null) ?? 0) < 0);
  }
  if (taskEmployeeFilter === "mine") list = list.filter((t) => t.assigneeId === currentUserId);
  else if (taskEmployeeFilter !== "all") list = list.filter((t) => t.assigneeId === taskEmployeeFilter);

  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div>
      <h1 className="page-title">To-Dos</h1>
      <p className="page-sub">
        Tasks either created directly or spun off from a meeting agenda item. Click a task to add or
        read notes; use the owner and due date fields to reassign or reschedule anytime.
      </p>

      <div className="panel-toolbar">
        <div className="filter-row">
          {(["all", "open", "overdue", "archived"] as const).map((f) => (
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
            <option value="mine">Mine ({firstNameOf(userById(currentUserId))})</option>
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
              <th style={{ width: 150 }}>Owner</th>
              <th style={{ width: 150 }}>Due</th>
              <th>Status</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No tasks match this filter.
                </td>
              </tr>
            )}
            {list.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                users={users}
                userById={userById}
                open={openNotesFor === t.id}
                onToggleOpen={() => setOpenNotesFor(openNotesFor === t.id ? null : t.id)}
                onToggleDone={() => toggleDone(t)}
                onSaveNotes={(notes) => saveNotes(t, notes)}
                onAddToMeeting={(seriesId) => addToMeeting(t, seriesId)}
                onDelete={() => setArchived(t, true)}
                onRestore={() => setArchived(t, false)}
                onChangeAssignee={(assigneeId) => changeAssignee(t, assigneeId)}
                onChangeDueDate={(dueDate) => changeDueDate(t, dueDate)}
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
              addTask(newTitle.trim(), newOwner, newDue);
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

function TaskRow({
  task,
  users,
  userById,
  open,
  onToggleOpen,
  onToggleDone,
  onSaveNotes,
  onAddToMeeting,
  onDelete,
  onRestore,
  onChangeAssignee,
  onChangeDueDate,
  mySeries,
}: {
  task: TaskData;
  users: UserLite[];
  userById: (id: string | null) => UserLite | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onSaveNotes: (notes: string) => void;
  onAddToMeeting: (seriesId: string) => void;
  onDelete: () => void;
  onRestore: () => void;
  onChangeAssignee: (assigneeId: string) => void;
  onChangeDueDate: (dueDate: string) => void;
  mySeries: SeriesData[];
}) {
  const [notes, setNotes] = useState(task.notes);
  const hasNotes = task.notes.trim().length > 0;
  const due = task.dueDate ? new Date(task.dueDate) : null;

  useAutosave(notes, (n) => onSaveNotes(n));

  return (
    <>
      <tr className="clickable-row" onClick={onToggleOpen}>
        <td onClick={(e) => e.stopPropagation()}>
          <button className={"checkbox" + (task.done ? " checked" : "")} onClick={onToggleDone} aria-label="Toggle done" />
        </td>
        <td className={task.done ? "strike-text" : ""}>
          <span className="row-expand-indicator">{open ? "▾" : "▸"}</span>
          {task.title}
          {task.agendaItemId && (
            <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}> · from meeting</span>
          )}
          {task.goalTitle && (
            <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}> · part of goal: {task.goalTitle}</span>
          )}
          {hasNotes && !open && <span className="notes-indicator" title="Has notes">📝</span>}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <select
            className="inline-edit-select"
            value={task.assigneeId ?? ""}
            onChange={(e) => onChangeAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <input
            type="date"
            className="inline-edit-date"
            value={task.dueDate ? isoDateOnly(task.dueDate) : ""}
            onChange={(e) => onChangeDueDate(e.target.value)}
          />
        </td>
        <td>
          <span className={"status-badge " + dueStatus(due, task.done)}>{dueLabel(due, task.done)}</span>
        </td>
        <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          {task.archived ? (
            <button className="btn" onClick={onRestore}>
              Restore
            </button>
          ) : (
            <button className="btn ghost-danger" onClick={onDelete}>
              Delete
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={5} style={{ paddingTop: 0 }}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <div className="mini-label">Notes</div>
                <button className="btn" onClick={onToggleOpen}>
                  Minimize ▴
                </button>
              </div>
              <textarea
                className="ai-notes"
                placeholder="Notes on this task…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
              />

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
