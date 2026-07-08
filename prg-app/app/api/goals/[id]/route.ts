import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["GOOD", "WARN", "CRIT"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: {
    status?: (typeof VALID_STATUSES)[number];
    notes?: string;
    done?: boolean;
    archived?: boolean;
    archivedAt?: Date | null;
  } = {};

  if (typeof body?.status === "string" && (VALID_STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status;
  }
  if (typeof body?.notes === "string") data.notes = body.notes;

  // Same archive cascade as tasks: checking a goal off as done archives
  // it; an explicit `archived` (Delete/Restore) always wins.
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

  const goal = await prisma.goal.update({ where: { id }, data, include: { assignee: true } });
  return NextResponse.json({ goal });
}
