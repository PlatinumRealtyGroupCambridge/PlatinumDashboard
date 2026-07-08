import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateInstanceAfter } from "@/lib/meetings-server";

// "Table to next meeting" — moves this agenda item to the next occurrence
// of the same meeting series, creating that occurrence if it doesn't exist
// yet, and flags it as tabled.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const current = await prisma.agendaItem.findUniqueOrThrow({
    where: { id },
    include: { instance: true },
  });

  const nextInstance = await getOrCreateInstanceAfter(
    current.instance.seriesId,
    current.instance.startsAt
  );

  const item = await prisma.agendaItem.update({
    where: { id },
    data: { instanceId: nextInstance.id, tabled: true, discussed: false },
    include: { addedBy: true, tasks: true },
  });

  return NextResponse.json({ item, instance: nextInstance });
}
