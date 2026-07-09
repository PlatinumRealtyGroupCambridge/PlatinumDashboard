import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeGoalCompletion } from "@/lib/goal-progress";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const existing = await prisma.task.findUnique({ where: { id }, select: { goalId: true } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const data: { done?: boolean; notes?: string; archived?: boolean; archivedAt?: Date | null } = {};

  if (typeof body?.notes === "string") data.notes = body.notes;

  // Checking a task off as done archives it automatically; unchecking it
  // brings it back out of the archive. Sub-tasks that belong to a goal are
  // the exception: they stay visible (not archived) when completed, so the
  // goal's own task list and progress bar keep showing them instead of the
  // task vanishing — see lib/goal-progress.ts, which recomputes the
  // parent goal's completion below. An explicit `archived` in the request
  // body (the Delete/Restore buttons) always wins over either default.
  if (typeof body?.done === "boolean") {
    data.done = body.done;
    if (!existing.goalId) {
      data.archived = body.done;
      data.archivedAt = body.done ? new Date() : null;
    }
  }
  if (typeof body?.archived === "boolean") {
    data.archived = body.archived;
    data.archivedAt = body.archived ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const task = await prisma.task.update({ where: { id }, data, include: { assignee: true } });

  if (existing.goalId && (typeof body?.done === "boolean" || typeof body?.archived === "boolean")) {
    await recomputeGoalCompletion(existing.goalId);
  }

  return NextResponse.json({ task });
}
