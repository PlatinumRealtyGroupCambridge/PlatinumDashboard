import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { discussed?: boolean; notes?: string } = {};
  if (typeof body?.discussed === "boolean") data.discussed = body.discussed;
  if (typeof body?.notes === "string") data.notes = body.notes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const item = await prisma.agendaItem.update({
    where: { id },
    data,
    include: { addedBy: true, tasks: true },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const existing = await prisma.agendaItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Agenda item not found" }, { status: 404 });
  }

  // Any tasks that were created from this agenda item (via "+ Create task")
  // aren't deleted with it — they just lose the back-link to the meeting
  // they came from, same as how deleting a user unassigns their tasks
  // instead of deleting those too.
  await prisma.$transaction([
    prisma.task.updateMany({ where: { agendaItemId: id }, data: { agendaItemId: null } }),
    prisma.agendaItem.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
