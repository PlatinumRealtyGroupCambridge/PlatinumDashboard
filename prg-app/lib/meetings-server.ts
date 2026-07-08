import { prisma } from "./prisma";

// Finds the next upcoming instance (startsAt >= now) for a series, or
// creates one immediately after the series' latest instance if every
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

  const last = series.instances[series.instances.length - 1];
  const incrementDays = series.type === "OWNERSHIP" ? 30 : 7;
  const nextDate = last
    ? new Date(last.startsAt.getTime() + incrementDays * 86400000)
    : now;

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
  const incrementDays = series.type === "OWNERSHIP" ? 30 : 7;
  const base = last && last.startsAt.getTime() > afterDate.getTime() ? last.startsAt : afterDate;
  const nextDate = new Date(base.getTime() + incrementDays * 86400000);

  return prisma.meetingInstance.create({
    data: { seriesId, startsAt: nextDate },
  });
}
