import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only "Meeting Efficiency" attendance for one meeting instance —
// GET fetches whatever's been marked so far (see AttendancePanel in
// components/MeetingApp.tsx), PATCH marks/updates one participant's row.
// Not participant-accessible: this is deliberately admin-eyes-only, per
// Tim's request that only admins can see/mark attendance.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const rows = await prisma.meetingAttendance.findMany({ where: { instanceId: id } });
  return NextResponse.json({
    attendance: rows.map((r) => ({
      userId: r.userId,
      status: r.status,
      prepared: r.prepared,
      focused: r.focused,
    })),
  });
}

const VALID_STATUS = new Set(["PRESENT", "LATE", "ABSENT"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const instance = await prisma.meetingInstance.findUnique({
    where: { id },
    include: { series: { include: { participants: true } } },
  });
  if (!instance) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!instance.series.participants.some((p) => p.userId === userId)) {
    return NextResponse.json({ error: "That person isn't part of this meeting." }, { status: 400 });
  }

  // Each field is only touched if the caller actually sent it, so a click
  // on just the "Late" chip doesn't accidentally clear prepared/focused —
  // the UI sends one field at a time (see markAttendance in MeetingApp.tsx).
  const hasField = (key: string) => Boolean(body) && Object.prototype.hasOwnProperty.call(body, key);

  const statusValue: "PRESENT" | "LATE" | "ABSENT" | null | undefined = !hasField("status")
    ? undefined
    : body.status === null
      ? null
      : VALID_STATUS.has(body.status)
        ? body.status
        : undefined;
  const preparedValue: boolean | null | undefined = !hasField("prepared")
    ? undefined
    : body.prepared === null
      ? null
      : Boolean(body.prepared);
  const focusedValue: boolean | null | undefined = !hasField("focused")
    ? undefined
    : body.focused === null
      ? null
      : Boolean(body.focused);

  const row = await prisma.meetingAttendance.upsert({
    where: { instanceId_userId: { instanceId: id, userId } },
    create: {
      instanceId: id,
      userId,
      status: statusValue ?? null,
      prepared: preparedValue ?? null,
      focused: focusedValue ?? null,
      markedById: viewer.id,
      markedAt: new Date(),
    },
    update: {
      ...(statusValue !== undefined ? { status: statusValue } : {}),
      ...(preparedValue !== undefined ? { prepared: preparedValue } : {}),
      ...(focusedValue !== undefined ? { focused: focusedValue } : {}),
      markedById: viewer.id,
      markedAt: new Date(),
    },
  });

  return NextResponse.json({
    attendance: { userId: row.userId, status: row.status, prepared: row.prepared, focused: row.focused },
  });
}
