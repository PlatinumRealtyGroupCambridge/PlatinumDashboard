import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zonedTimeToUtc } from "@/lib/timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Aggregated "Meeting Efficiency" stats for the admin stats page
// (app/(app)/admin/meeting-efficiency + components/MeetingEfficiencyApp.tsx).
// Accepts optional ?userId=<id|all>&from=YYYY-MM-DD&to=YYYY-MM-DD query
// params and rolls up every MeetingAttendance row matching those filters
// into per-person counts of attended/late/missed/prepared/distracted
// meetings. Only meetings an admin actually marked count toward these
// stats — an unmarked meeting is simply excluded, not counted as a miss.
export async function GET(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userIdFilter = searchParams.get("userId");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const startsAtFilter: { gte?: Date; lt?: Date } = {};
  if (fromStr && DATE_RE.test(fromStr)) {
    const [y, m, d] = fromStr.split("-").map(Number);
    startsAtFilter.gte = zonedTimeToUtc(y, m - 1, d, 0, 0);
  }
  if (toStr && DATE_RE.test(toStr)) {
    const [y, m, d] = toStr.split("-").map(Number);
    // Exclusive upper bound at the start of the day AFTER `to`, so the
    // entire `to` calendar day (as observed in Eastern time) is included —
    // same reasoning as the due-date timezone handling elsewhere in the app.
    startsAtFilter.lt = new Date(zonedTimeToUtc(y, m - 1, d, 0, 0).getTime() + 24 * 60 * 60 * 1000);
  }

  const [users, rows] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.meetingAttendance.findMany({
      where: {
        ...(userIdFilter && userIdFilter !== "all" ? { userId: userIdFilter } : {}),
        ...(Object.keys(startsAtFilter).length ? { instance: { startsAt: startsAtFilter } } : {}),
      },
      include: { instance: { include: { series: true } } },
      orderBy: { instance: { startsAt: "desc" } },
    }),
  ]);

  type Tally = {
    marked: number;
    present: number;
    late: number;
    absent: number;
    prepared: number;
    unprepared: number;
    focused: number;
    distracted: number;
  };
  const emptyTally = (): Tally => ({
    marked: 0,
    present: 0,
    late: 0,
    absent: 0,
    prepared: 0,
    unprepared: 0,
    focused: 0,
    distracted: 0,
  });

  const tallyByUser = new Map<string, Tally>();
  for (const row of rows) {
    const t = tallyByUser.get(row.userId) ?? emptyTally();
    t.marked += 1;
    if (row.status === "PRESENT") t.present += 1;
    if (row.status === "LATE") t.late += 1;
    if (row.status === "ABSENT") t.absent += 1;
    if (row.prepared === true) t.prepared += 1;
    if (row.prepared === false) t.unprepared += 1;
    if (row.focused === true) t.focused += 1;
    if (row.focused === false) t.distracted += 1;
    tallyByUser.set(row.userId, t);
  }

  const relevantUsers =
    userIdFilter && userIdFilter !== "all" ? users.filter((u) => u.id === userIdFilter) : users;

  const summary = relevantUsers.map((u) => {
    const t = tallyByUser.get(u.id) ?? emptyTally();
    return {
      userId: u.id,
      name: u.name,
      initials: u.initials,
      color: u.color,
      meetingsTracked: t.marked,
      attended: t.present + t.late,
      late: t.late,
      missed: t.absent,
      prepared: t.prepared,
      unprepared: t.unprepared,
      distracted: t.distracted,
    };
  });

  // Only include the meeting-by-meeting breakdown when a single person is
  // selected — with everyone shown at once this list would get long and
  // isn't what the summary table is for.
  const detail =
    userIdFilter && userIdFilter !== "all"
      ? rows.map((r) => ({
          instanceId: r.instanceId,
          seriesName: r.instance.series.name,
          startsAt: r.instance.startsAt.toISOString(),
          status: r.status,
          prepared: r.prepared,
          focused: r.focused,
        }))
      : [];

  return NextResponse.json({ summary, detail });
}
