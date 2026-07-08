import { prisma } from "./prisma";
import type { MeetingManagementData, MeetingRef } from "./meeting-types";

// Fetches everything the Meeting Management client island needs in one
// shot and serializes it to plain JSON-safe values (dates -> ISO strings).
export async function getMeetingManagementData(): Promise<MeetingManagementData> {
  const [users, series, tasks, goals] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.meetingSeries.findMany({
      include: {
        participants: true,
        instances: {
          orderBy: { startsAt: "asc" },
          include: { agendaItems: { orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    prisma.task.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        meetingRefs: { include: { instance: { include: { series: true } } } },
      },
    }),
    prisma.goal.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        meetingRefs: { include: { instance: { include: { series: true } } } },
      },
    }),
  ]);

  const taskIdsByAgendaItem = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.agendaItemId) continue;
    const arr = taskIdsByAgendaItem.get(t.agendaItemId) ?? [];
    arr.push(t.id);
    taskIdsByAgendaItem.set(t.agendaItemId, arr);
  }

  const toRefs = (
    refs: Array<{
      id: string;
      instanceId: string;
      instance: { startsAt: Date; series: { id: string; name: string } };
    }>
  ): MeetingRef[] =>
    refs.map((r) => ({
      agendaItemId: r.id,
      seriesId: r.instance.series.id,
      seriesName: r.instance.series.name,
      instanceId: r.instanceId,
      startsAt: r.instance.startsAt.toISOString(),
    }));

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      initials: u.initials,
      color: u.color,
    })),
    series: series.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      durationMins: s.durationMins,
      color: s.color,
      participantIds: s.participants.map((p) => p.userId),
      instances: s.instances.map((inst) => ({
        id: inst.id,
        seriesId: inst.seriesId,
        startsAt: inst.startsAt.toISOString(),
        agendaItems: inst.agendaItems.map((a) => ({
          id: a.id,
          instanceId: a.instanceId,
          title: a.title,
          discussed: a.discussed,
          notes: a.notes,
          tabled: a.tabled,
          addedById: a.addedById,
          sourceType: a.sourceType,
          sourceTaskId: a.sourceTaskId,
          sourceGoalId: a.sourceGoalId,
          taskIds: taskIdsByAgendaItem.get(a.id) ?? [],
        })),
      })),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      done: t.done,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      assigneeId: t.assigneeId,
      agendaItemId: t.agendaItemId,
      meetingRefs: toRefs(t.meetingRefs),
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      notes: g.notes,
      status: g.status,
      dueDate: g.dueDate ? g.dueDate.toISOString() : null,
      assigneeId: g.assigneeId,
      meetingRefs: toRefs(g.meetingRefs),
    })),
  };
}
