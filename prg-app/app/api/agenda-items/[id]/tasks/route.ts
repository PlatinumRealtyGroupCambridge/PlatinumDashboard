import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";

// Create one or more tasks off of a single agenda item (multiple tasks per
// agenda item are supported — this can be called repeatedly).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = (body?.title || "").trim();
  const assigneeId = body?.assigneeId || null;
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const viewer = await getCurrentViewer();
  const task = await prisma.task.create({
    data: {
      title,
      assigneeId,
      dueDate,
      agendaItemId: id,
      createdById: viewer?.id ?? null,
    },
    include: { assignee: true },
  });

  return NextResponse.json({ task });
}
