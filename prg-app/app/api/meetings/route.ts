import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colorForIndex } from "@/lib/colors";
import { zonedTimeToUtc } from "@/lib/timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Creates a one-off meeting: a MeetingSeries with type ONE_OFF and exactly
// one MeetingInstance, reusing the same models (and therefore the same
// calendar/list rendering, agenda items, and Google Chat bot agenda-item
// support) as every recurring series. See lib/chat-bot.ts's create_meeting
// tool for the chat-driven equivalent of this same action.
export async function POST(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const date = typeof body?.date === "string" ? body.date : "";
  const time = typeof body?.time === "string" ? body.time : "";
  const durationMinsRaw = Number(body?.durationMins);
  const durationMins = Number.isFinite(durationMinsRaw) ? Math.min(480, Math.max(5, Math.round(durationMinsRaw))) : 30;
  const requestedParticipantIds = Array.isArray(body?.participantUserIds)
    ? body.participantUserIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  if (!title) {
    return NextResponse.json({ error: "Give the meeting a title." }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
  }
  if (!TIME_RE.test(time)) {
    return NextResponse.json({ error: "Pick a valid time." }, { status: 400 });
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const startsAt = zonedTimeToUtc(year, month - 1, day, hour, minute);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "That date/time didn't parse — try again." }, { status: 400 });
  }

  // The creator is always in their own meeting, whether or not they
  // explicitly checked their own name.
  const participantIds = Array.from(new Set([viewer.id, ...requestedParticipantIds]));
  const validUsers = await prisma.user.findMany({ where: { id: { in: participantIds } } });
  const validIds = validUsers.map((u) => u.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "Couldn't find any of those team members." }, { status: 400 });
  }

  const seriesCount = await prisma.meetingSeries.count();

  const series = await prisma.meetingSeries.create({
    data: {
      type: "ONE_OFF",
      name: title,
      durationMins,
      color: colorForIndex(seriesCount),
      participants: { create: validIds.map((userId) => ({ userId })) },
      instances: { create: [{ startsAt }] },
    },
    include: { participants: true, instances: true },
  });

  return NextResponse.json({
    series: {
      id: series.id,
      type: series.type,
      name: series.name,
      durationMins: series.durationMins,
      color: series.color,
      participantIds: series.participants.map((p) => p.userId),
      instances: series.instances.map((inst) => ({
        id: inst.id,
        seriesId: inst.seriesId,
        startsAt: inst.startsAt.toISOString(),
        agendaItems: [],
      })),
    },
  });
}
