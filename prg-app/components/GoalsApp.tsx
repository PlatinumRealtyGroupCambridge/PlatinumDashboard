"use client";

import { useState } from "react";
import type { GoalData, SeriesData, TaskData, UserLite } from "@/lib/meeting-types";
import {
  GOAL_STATUS_CLASS,
  GOAL_STATUS_CYCLE,
  GOAL_STATUS_LABEL,
  apiJson,
  defaultDueDateInput,
  firstNameOf,
  fmtDate,
  fmtDueDate,
  nextInstance,
  useAutosave,
} from "@/lib/meeting-client-utils";

type GoalFilter = "active" | "archived";

export default function GoalsApp({
  initialGoals,
  users,
  currentUserId,
  series,
}: {
  initialGoals: GoalData[];
  users: UserLite[];
  currentUserId: string;
  series: SeriesData[];
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("active");
  const [goalEmployeeFilter, setGoalEmployeeFilter] = useState<string>("all");
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState(users[0]?.id ?? "");
  const [newDue, setNewDue] = useState(defaultDueDateInput());

  const userById = (id: string | null) => (id ? users.find((u) => u.id === id) : undefined);
  const mySeries = series.filter((s) => s.participantIds.includes(currentUserId));

  async function cycleStatus(goal: GoalData) {
    const next = GOAL_STATUS_CYCLE[goal.status];
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, status: next } : g)));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { status: next }).catch(() => {});
  }

  async function toggleDone(goal: GoalData) {
    const next = !goal.done;
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, done: next, archived: next } : g)));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { done: next }).catch(() => {});
  }

  async function saveNotes(goal: GoalData, notes: string) {
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, notes } : g)));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { notes }).catch(() => {});
  }

  async function setArchived(goal: GoalData, archived: boolean) {
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, archived } : g)));
    await apiJson(`/api/goals/${goal.id}`, "PATCH", { archived }).catch(() => {});
  }

  async function addGoal(title: string, assigneeId: string, dueDate: string) {
    const { goal } = await apiJson("/api/goals", "POST", { title, assigneeId, dueDate });
    setGoals((gs) => [
      ...gs,
      {
        id: goal.id,
        title: goal.title,
        notes: "",
        status: "GOOD",
        done: false,
        archived: false,
        dueDate: goal.dueDate,
        assigneeId: goal.assigneeId,
        meetingRefs: [],
        subtasks: [],
      },
    ]);
  }

  async function addToMeeting(goal: GoalData, seriesId: string) {
    const { agendaItem } = await apiJson(`/api/goals/${goal.id}/meeting-refs`, "POST", { seriesId });
    const ref = {
      agendaItemId: agendaItem.id,
      seriesId: agendaItem.instance.series.id,
      seriesName: agendaItem.instance.series.name,
      instanceId: agendaItem.instanceId,
      startsAt: agendaItem.instance.startsAt,
    };
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, meetingRefs: [...g.meetingRefs, ref] } : g)));
  }

  // A goal's completion is derived from its sub-tasks (see
  // lib/goal-progress.ts, which does the same computation server-side —
  // these local updates just keep the screen in sync immediately instead
  // of waiting on a refetch).
  function recomputeLocalGoalCompletion(goal: GoalData, subtasks: TaskData[]): Pick<GoalData, "done" | "archived"> {
    const allDone = subtasks.length > 0 && subtasks.every((t) => t.done);
    return { done: allDone, archived: allDone };
  }

  async function addSubtask(goal: GoalData, title: string, assigneeId: string, dueDate: string) {
    const { task } = await apiJson("/api/tasks", "POST", { title, assigneeId, dueDate, goalId: goal.id });
    const newTask: TaskData = {
      id: task.id,
      title: task.title,
      notes: "",
      done: false,
      archived: false,
      dueDate: task.dueDate,
      assigneeId: task.assigneeId,
      agendaItemId: null,
      meetingRefs: [],
      goalId: goal.id,
      goalTitle: goal.title,
    };
    setGoals((gs) =>
      gs.map((g) => {
        if (g.id !== goal.id) return g;
        const subtasks = [...g.subtasks, newTask];
        return { ...g, subtasks, ...recomputeLocalGoalCompletion(g, subtasks) };
      })
    );
  }

  async function toggleSubtaskDone(goal: GoalData, subtask: TaskData) {
    const next = !subtask.done;
    setGoals((gs) =>
      gs.map((g) => {
        if (g.id !== goal.id) return g;
        const subtasks = g.subtasks.map((t) => (t.id === subtask.id ? { ...t, done: next } : t));
        return { ...g, subtasks, ...recomputeLocalGoalCompletion(g, subtasks) };
      })
    );
    await apiJson(`/api/tasks/${subtask.id}`, "PATCH", { done: next }).catch(() => {});
  }

  async function deleteSubtask(goal: GoalData, subtask: TaskData) {
    setGoals((gs) =>
      gs.map((g) => {
        if (g.id !== goal.id) return g;
        const subtasks = g.subtasks.filter((t) => t.id !== subtask.id);
        return { ...g, subtasks, ...recomputeLocalGoalCompletion(g, subtasks) };
      })
    );
    await apiJson(`/api/tasks/${subtask.id}`, "PATCH", { archived: true }).catch(() => {});
  }

  let list = goals.slice();
  list = goalFilter === "archived" ? list.filter((g) => g.archived) : list.filter((g) => !g.archived);
  if (goalEmployeeFilter === "mine") list = list.filter((g) => g.assigneeId === currentUserId);
  else if (goalEmployeeFilter !== "all") list = list.filter((g) => g.assigneeId === goalEmployeeFilter);

  return (
    <div>
      <h1 className="page-title">Goals</h1>
      <p className="page-sub">
        Medium-to-long-term goals, owned by a person, made up of the tasks that get you there.
      </p>
      <div className="proto-banner" style={{ marginBottom: 20 }}>
        <b>How this works:</b> click a goal to add tasks under it — the progress bar tracks how many of
        those tasks are done. Once every task under a goal is checked off, the goal itself is
        automatically marked achieved and moves to the Archived list. The <b>status</b> badge (On track /
        At risk / Behind) is separate — that stays a judgment call the goal&apos;s <b>owner</b> makes,
        click it to cycle through.
      </div>

      <div className="panel-toolbar">
        <div className="filter-row">
          {(["active", "archived"] as const).map((f) => (
            <button
              key={f}
              className={"filter-chip" + (goalFilter === f ? " active" : "")}
              onClick={() => setGoalFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center", marginRight: 2 }}>
            Employee
          </label>
          <select value={goalEmployeeFilter} onChange={(e) => setGoalEmployeeFilter(e.target.value)}>
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
              <th>Goal</th>
              <th>Owner</th>
              <th style={{ width: 140 }}>Progress</th>
              <th>Target</th>
              <th>Status</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  No goals match this filter.
                </td>
              </tr>
            )}
            {list.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                users={users}
                userById={userById}
                open={openNotesFor === g.id}
                onToggleOpen={() => setOpenNotesFor(openNotesFor === g.id ? null : g.id)}
                onToggleDone={() => toggleDone(g)}
                onCycleStatus={() => cycleStatus(g)}
                onSaveNotes={(notes) => saveNotes(g, notes)}
                onAddToMeeting={(seriesId) => addToMeeting(g, seriesId)}
                onDelete={() => setArchived(g, true)}
                onRestore={() => setArchived(g, false)}
                onAddSubtask={(title, assigneeId, dueDate) => addSubtask(g, title, assigneeId, dueDate)}
                onToggleSubtaskDone={(subtask) => toggleSubtaskDone(g, subtask)}
                onDeleteSubtask={(subtask) => deleteSubtask(g, subtask)}
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
              addGoal(newTitle.trim(), newOwner, newDue);
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
  users,
  userById,
  open,
  onToggleOpen,
  onToggleDone,
  onCycleStatus,
  onSaveNotes,
  onAddToMeeting,
  onDelete,
  onRestore,
  onAddSubtask,
  onToggleSubtaskDone,
  onDeleteSubtask,
  mySeries,
}: {
  goal: GoalData;
  users: UserLite[];
  userById: (id: string | null) => UserLite | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onCycleStatus: () => void;
  onSaveNotes: (notes: string) => void;
  onAddToMeeting: (seriesId: string) => void;
  onDelete: () => void;
  onRestore: () => void;
  onAddSubtask: (title: string, assigneeId: string, dueDate: string) => void;
  onToggleSubtaskDone: (subtask: TaskData) => void;
  onDeleteSubtask: (subtask: TaskData) => void;
  mySeries: SeriesData[];
}) {
  const [notes, setNotes] = useState(goal.notes);
  const hasNotes = goal.notes.trim().length > 0;
  const doneCount = goal.subtasks.filter((t) => t.done).length;
  const totalCount = goal.subtasks.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  useAutosave(notes, (n) => onSaveNotes(n));

  return (
    <>
      <tr className="clickable-row" onClick={onToggleOpen}>
        <td onClick={(e) => e.stopPropagation()}>
          <button
            className={"checkbox" + (goal.done ? " checked" : "")}
            onClick={onToggleDone}
            aria-label="Mark complete"
          />
        </td>
        <td className={goal.done ? "strike-text" : ""}>
          <span className="row-expand-indicator">{open ? "▾" : "▸"}</span>
          {goal.title}
          {hasNotes && !open && <span className="notes-indicator" title="Has notes">📝</span>}
        </td>
        <td className="owner-chip">{userById(goal.assigneeId)?.name ?? "Unassigned"}</td>
        <td>
          <GoalProgressBar doneCount={doneCount} totalCount={totalCount} pct={pct} />
        </td>
        <td>{goal.dueDate ? fmtDueDate(new Date(goal.dueDate)) : "No target"}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <button
            className={"status-badge " + GOAL_STATUS_CLASS[goal.status]}
            onClick={onCycleStatus}
            title="Click to update status"
          >
            {GOAL_STATUS_LABEL[goal.status]}
          </button>
        </td>
        <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          {goal.archived ? (
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
          <td colSpan={6} style={{ paddingTop: 0 }}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <div className="mini-label">Notes</div>
                <button className="btn" onClick={onToggleOpen}>
                  Minimize ▴
                </button>
              </div>
              <textarea
                className="ai-notes"
                placeholder="Notes on this goal…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
              />

              <div className="mini-label">
                Tasks {totalCount > 0 && <span className="task-count-sub">({doneCount}/{totalCount})</span>}
              </div>
              <GoalProgressBar doneCount={doneCount} totalCount={totalCount} pct={pct} showLabel />
              <SubtaskList
                subtasks={goal.subtasks}
                userById={userById}
                onToggleDone={onToggleSubtaskDone}
                onDelete={onDeleteSubtask}
              />
              <AddSubtaskForm users={users} onAdd={onAddSubtask} />

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

function GoalProgressBar({
  doneCount,
  totalCount,
  pct,
  showLabel = false,
}: {
  doneCount: number;
  totalCount: number;
  pct: number;
  showLabel?: boolean;
}) {
  if (totalCount === 0) {
    return showLabel ? <div className="autosave-hint">No tasks yet — add one below.</div> : <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>No tasks yet</span>;
  }
  return (
    <div className="goal-progress-wrap">
      <div className="goal-progress-bar">
        <div className="goal-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <div className="goal-progress-label">
          {doneCount} of {totalCount} tasks complete — {pct}%
        </div>
      )}
    </div>
  );
}

function SubtaskList({
  subtasks,
  userById,
  onToggleDone,
  onDelete,
}: {
  subtasks: TaskData[];
  userById: (id: string | null) => UserLite | undefined;
  onToggleDone: (subtask: TaskData) => void;
  onDelete: (subtask: TaskData) => void;
}) {
  if (!subtasks.length) return null;
  return (
    <div className="subtask-list">
      {subtasks.map((t) => (
        <div key={t.id} className="subtask-row">
          <button
            className={"checkbox" + (t.done ? " checked" : "")}
            onClick={() => onToggleDone(t)}
            aria-label="Toggle task done"
          />
          <span className={"subtask-title" + (t.done ? " strike-text" : "")}>{t.title}</span>
          <span className="subtask-meta">{userById(t.assigneeId)?.name.split(" ")[0] ?? "Unassigned"}</span>
          <span className="subtask-meta">{t.dueDate ? fmtDueDate(new Date(t.dueDate)) : "No due date"}</span>
          <button className="subtask-remove" onClick={() => onDelete(t)} aria-label="Remove task" title="Remove task">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function AddSubtaskForm({
  users,
  onAdd,
}: {
  users: UserLite[];
  onAdd: (title: string, assigneeId: string, dueDate: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(users[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(defaultDueDateInput());

  return (
    <div className="inline-form">
      <input
        type="text"
        placeholder="New task for this goal…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button
        className="btn primary"
        onClick={() => {
          if (title.trim()) {
            onAdd(title.trim(), assigneeId, dueDate);
            setTitle("");
          }
        }}
      >
        + Add task
      </button>
    </div>
  );
}

function MeetingRefs({ refs }: { refs: GoalData["meetingRefs"] }) {
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
