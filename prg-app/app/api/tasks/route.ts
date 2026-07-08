import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const title = (body?.title || "").trim();
  const assigneeId = body?.assigneeId || null;
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const viewer = await getCurrentViewer();
  const task = await prisma.task.create({
    data: { title, assigneeId, dueDate, createdById: viewer?.id ?? null },
    include: { assignee: true },
  });

  return NextResponse.json({ task });
}
