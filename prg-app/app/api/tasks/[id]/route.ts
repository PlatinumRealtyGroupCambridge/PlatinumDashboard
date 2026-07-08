import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { done?: boolean; notes?: string } = {};
  if (typeof body?.done === "boolean") data.done = body.done;
  if (typeof body?.notes === "string") data.notes = body.notes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const task = await prisma.task.update({ where: { id }, data, include: { assignee: true } });
  return NextResponse.json({ task });
}
