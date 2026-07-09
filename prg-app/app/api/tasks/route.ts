import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";
import { recomputeGoalCompletion } from "@/lib/goal-progress";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const title = (body?.title || "").trim();
  const assigneeId = body?.assigneeId || null;
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;
  const goalId = body?.goalId || null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const viewer = await getCurrentViewer();
  const task = await prisma.task.create({
    data: { title, assigneeId, dueDate, goalId, createdById: viewer?.id ?? null },
    include: { assignee: true },
  });

  // A freshly-added sub-task starts un-done, so if the goal had previously
  // been fully completed (all its other sub-tasks done), adding a new one
  // un-completes it again — keep the goal's state honest.
  if (goalId) {
    await recomputeGoalCompletion(goalId);
  }

  return NextResponse.json({ task });
}
