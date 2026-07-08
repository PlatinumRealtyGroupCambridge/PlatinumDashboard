import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { done?: boolean; notes?: string; archived?: boolean; archivedAt?: Date | null } = {};

  if (typeof body?.notes === "string") data.notes = body.notes;

  // Checking a task off as done archives it automatically; unchecking it
  // brings it back out of the archive. An explicit `archived` in the
  // request body (the Delete/Restore buttons) always wins over that
  // default so a completed-but-restored task doesn't immediately
  // re-archive itself.
  if (typeof body?.done === "boolean") {
    data.done = body.done;
    data.archived = body.done;
    data.archivedAt = body.done ? new Date() : null;
  }
  if (typeof body?.archived === "boolean") {
    data.archived = body.archived;
    data.archivedAt = body.archived ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const task = await prisma.task.update({ where: { id }, data, include: { assignee: true } });
  return NextResponse.json({ task });
}
