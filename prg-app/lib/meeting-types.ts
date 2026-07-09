export type UserLite = {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
};

export type MeetingRef = {
  agendaItemId: string;
  seriesId: string;
  seriesName: string;
  instanceId: string;
  startsAt: string;
};

export type AgendaItemData = {
  id: string;
  instanceId: string;
  title: string;
  discussed: boolean;
  notes: string;
  tabled: boolean;
  addedById: string | null;
  sourceType: string | null;
  sourceTaskId: string | null;
  sourceGoalId: string | null;
  taskIds: string[];
};

export type InstanceData = {
  id: string;
  seriesId: string;
  startsAt: string;
  agendaItems: AgendaItemData[];
};

export type SeriesData = {
  id: string;
  type: "ONE_ON_ONE" | "TEAM" | "OWNERSHIP" | "ONE_OFF";
  name: string;
  durationMins: number;
  color: string;
  participantIds: string[];
  instances: InstanceData[];
};

export type TaskData = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  archived: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  agendaItemId: string | null;
  meetingRefs: MeetingRef[];
  // set if this task is a sub-task of a goal (see GoalData.subtasks) —
  // goalTitle is included so the Todos list can show "part of goal: X"
  // without a separate lookup
  goalId: string | null;
  goalTitle: string | null;
};

export type GoalData = {
  id: string;
  title: string;
  notes: string;
  status: "GOOD" | "WARN" | "CRIT";
  done: boolean;
  archived: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  meetingRefs: MeetingRef[];
  // sub-tasks that make up this goal — used for the nested task list and
  // progress bar. Always the goal's non-archived sub-tasks (archived ones,
  // i.e. deleted, are left out so they don't skew progress).
  subtasks: TaskData[];
};

// Admin-only "Meeting Efficiency" attendance record for one participant on
// one meeting instance. Fetched separately from the rest of
// MeetingManagementData (see AttendancePanel in components/MeetingApp.tsx)
// rather than embedded in every instance, since only admins ever need it
// and most instances will never be opened by an admin at all.
export type AttendanceRow = {
  userId: string;
  status: "PRESENT" | "LATE" | "ABSENT" | null;
  prepared: boolean | null;
  focused: boolean | null;
};

export type MeetingManagementData = {
  users: UserLite[];
  series: SeriesData[];
  tasks: TaskData[];
  goals: GoalData[];
};
