import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteMeetingInstance } from "@/lib/meetings-server";

// Deletes one scheduled meeting occurrence, from either the "Delete
// meeting" button in the Meeting Management UI or the chat bot's
// delete_meeting tool (lib/chat-bot.ts). See deleteMeetingInstance's own
// comment (lib/meetings-server.ts) for exactly what this does for a
// one-off meeting vs. a recurring series.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await params;
  const instance = await prisma.meetingInstance.findUnique({
    where: { id },
    include: { series: { include: { participants: true } } },
  });
  if (!instance) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Only an admin or someone actually in the meeting can delete it — mirrors
  // the same participant-or-admin scoping getMeetingManagementData applies
  // when deciding which meetings someone can even see in the first place.
  const isParticipant = instance.series.participants.some((p) => p.userId === viewer.id);
  if (!viewer.isAdmin && !isParticipant) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const result = await deleteMeetingInstance(id);
  return NextResponse.json({
    ok: true,
    seriesId: result?.seriesId ?? instance.seriesId,
    seriesDeleted: result?.seriesDeleted ?? false,
  });
}
