import { prisma } from "./prisma";

// Pure date math shared by getOrCreateNextInstance (which persists the
// result) and the chat bot's meeting listing (which only needs to *know*
// the true next date without creating anything) — kept in one place so
// those two can never disagree about what "next" means for a series.
// Picks the earliest already-existing instance that's still upcoming; if
// none exists, advances from the latest known instance by the series'
// interval, repeatedly if needed, until the result is actually upcoming.
// A single increment would assume this is being computed shortly after the
// last known instance passed — not true if the series went quiet for
// longer than that (e.g. the app itself was down for a while).
// Returns null for a ONE_OFF meeting that's already happened — unlike a
// recurring series, a one-off doesn't regenerate itself, so it genuinely
// has no "next" occurrence (rather than silently fabricating one 7 days
// later, which the recurrence formula below would otherwise do for any
// series type).
export function computeNextInstanceDate(
  series: { type: string; recurrenceIntervalDays: number | null },
  instances: { startsAt: Date }[],
  now: Date = new Date()
): Date | null {
  const sorted = [...instances].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const upcoming = sorted.find((i) => i.startsAt.getTime() >= now.getTime());
  if (upcoming) return upcoming.startsAt;
  if (series.type === "ONE_OFF") return null;

  const last = sorted[sorted.length - 1];
  const incrementDays = series.recurrenceIntervalDays ?? (series.type === "OWNERSHIP" ? 30 : 7);
  let nextDate = last ? new Date(last.startsAt.getTime() + incrementDays * 86400000) : now;
  while (nextDate.getTime() < now.getTime()) {
    nextDate = new Date(nextDate.getTime() + incrementDays * 86400000);
  }
  return nextDate;
}

// Finds the next upcoming instance (startsAt >= now) for a series, or
// creates one at the date computeNextInstanceDate works out if every
// existing instance is already in the past. Mirrors the prototype's
// fallback of appending a new instance when "tabling" past the end of the
// pre-generated list.
export async function getOrCreateNextInstance(seriesId: string) {
  const series = await prisma.meetingSeries.findUniqueOrThrow({
    where: { id: seriesId },
    include: { instances: { orderBy: { startsAt: "asc" } } },
  });

  const now = new Date();
  const upcoming = series.instances.find((i) => i.startsAt.getTime() >= now.getTime());
  if (upcoming) return upcoming;

  const nextDate = computeNextInstanceDate(series, series.instances, now);
  if (!nextDate) {
    throw new Error(`"${series.name}" already happened and, as a one-off meeting, doesn't recur.`);
  }
  return prisma.meetingInstance.create({
    data: { seriesId, startsAt: nextDate },
  });
}

// Given an agenda item's current instance, finds/creates the instance for
// the *next* occurrence of that same series (strictly after the current
// instance's date), used by "Table to next meeting".
export async function getOrCreateInstanceAfter(seriesId: string, afterDate: Date) {
  const series = await prisma.meetingSeries.findUniqueOrThrow({
    where: { id: seriesId },
    include: { instances: { orderBy: { startsAt: "asc" } } },
  });

  const next = series.instances.find((i) => i.startsAt.getTime() > afterDate.getTime());
  if (next) return next;

  const last = series.instances[series.instances.length - 1];
  const incrementDays = series.recurrenceIntervalDays ?? (series.type === "OWNERSHIP" ? 30 : 7);
  const base = last && last.startsAt.getTime() > afterDate.getTime() ? last.startsAt : afterDate;
  const nextDate = new Date(base.getTime() + incrementDays * 86400000);

  return prisma.meetingInstance.create({
    data: { seriesId, startsAt: nextDate },
  });
}

// Finds the next upcoming instance (startsAt >= now) for a series WITHOUT
// creating one if none exists — unlike getOrCreateNextInstance above, used
// where creating a fresh instance just to immediately act on (or delete) it
// would be pointless. Used by the "delete a scheduled meeting" chat command
// (lib/chat-bot.ts's delete_meeting tool).
export async function findUpcomingInstance(seriesId: string) {
  return prisma.meetingInstance.findFirst({
    where: { seriesId, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
}

// Deletes one scheduled meeting occurrence — used by both the "Delete
// meeting" button in the Meeting Management UI and the chat bot's
// delete_meeting tool.
//
// Any Task that was created from an agenda item on this instance has its
// agendaItemId nulled out first (mirrors the same FK-safety pattern used in
// app/api/agenda-items/[id]/route.ts) — AgendaItem rows themselves cascade-
// delete automatically once the instance is gone (see
// MeetingInstance.agendaItems' onDelete: Cascade in schema.prisma), but
// Task.agendaItemId has no onDelete specified, so a Task still pointing at
// one of those agenda items would otherwise cause the delete to fail with
// an FK violation.
//
// A one-off meeting (MeetingType.ONE_OFF) IS this single instance — once
// it's gone, the MeetingSeries that wrapped it has no purpose left, so this
// also deletes that series (cascading its MeetingParticipant rows).
// Leaving an empty ONE_OFF series around would let it confusingly resurface
// — e.g. the chat bot's add_agenda_item tool would silently recreate a
// brand new instance for it via getOrCreateNextInstance the next time
// someone tried to add to "their meetings" list. Recurring series
// (ONE_ON_ONE / TEAM / OWNERSHIP) are left alone even if this was their
// only instance — getOrCreateNextInstance regenerates the next occurrence
// for those automatically whenever it's next needed, so deleting one
// occurrence just cancels that specific date without affecting the
// recurring pattern going forward.
export async function deleteMeetingInstance(instanceId: string) {
  const instance = await prisma.meetingInstance.findUnique({
    where: { id: instanceId },
    include: { series: true, agendaItems: { select: { id: true } } },
  });
  if (!instance) return null;

  const agendaItemIds = instance.agendaItems.map((a) => a.id);

  await prisma.$transaction([
    ...(agendaItemIds.length
      ? [prisma.task.updateMany({ where: { agendaItemId: { in: agendaItemIds } }, data: { agendaItemId: null } })]
      : []),
    prisma.meetingInstance.delete({ where: { id: instanceId } }),
  ]);

  let seriesDeleted = false;
  if (instance.series.type === "ONE_OFF") {
    await prisma.meetingSeries.delete({ where: { id: instance.seriesId } });
    seriesDeleted = true;
  }

  return { seriesId: instance.seriesId, seriesName: instance.series.name, seriesType: instance.series.type, seriesDeleted };
}

// "Delete all future meetings" on a recurring series — the counterpart to
// deleteMeetingInstance's "just this one" behavior. Removes every
// not-yet-happened instance (same FK-safety nulling for any Task pointing
// at one of their agenda items) and marks the series inactive so
// getOrCreateNextInstance never generates another occurrence for it. Past
// instances, and the agenda items/attendance history on them, are left
// alone — this stops the series going forward, it doesn't erase it.
// Every series-listing query (lib/get-meeting-data.ts, lib/chat-bot.ts,
// app/(app)/page.tsx) filters on active: true, so an ended series quietly
// stops appearing anywhere rather than needing special-case handling at
// each call site.
export async function deleteFutureInstancesAndEndSeries(seriesId: string) {
  const now = new Date();
  const series = await prisma.meetingSeries.findUnique({
    where: { id: seriesId },
    include: {
      instances: {
        where: { startsAt: { gte: now } },
        include: { agendaItems: { select: { id: true } } },
      },
    },
  });
  if (!series) return null;

  const instanceIds = series.instances.map((i) => i.id);
  const agendaItemIds = series.instances.flatMap((i) => i.agendaItems.map((a) => a.id));

  await prisma.$transaction([
    ...(agendaItemIds.length
      ? [prisma.task.updateMany({ where: { agendaItemId: { in: agendaItemIds } }, data: { agendaItemId: null } })]
      : []),
    ...(instanceIds.length ? [prisma.meetingInstance.deleteMany({ where: { id: { in: instanceIds } } })] : []),
    prisma.meetingSeries.update({ where: { id: seriesId }, data: { active: false } }),
  ]);

  return { seriesId, seriesName: series.name, seriesType: series.type };
}
