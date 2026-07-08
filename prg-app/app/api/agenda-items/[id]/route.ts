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
