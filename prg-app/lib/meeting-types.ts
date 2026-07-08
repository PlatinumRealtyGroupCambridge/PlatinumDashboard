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
  type: "ONE_ON_ONE" | "TEAM" | "OWNERSHIP";
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
};

export type MeetingManagementData = {
  users: UserLite[];
  series: SeriesData[];
  tasks: TaskData[];
  goals: GoalData[];
};
