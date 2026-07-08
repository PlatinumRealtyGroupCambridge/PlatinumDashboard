import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";
import { getOrCreateNextInstance } from "@/lib/meetings-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const seriesId = body?.seriesId;
  if (!seriesId) {
    return NextResponse.json({ error: "seriesId is required" }, { status: 400 });
  }

  const goal = await prisma.goal.findUniqueOrThrow({ where: { id } });
  const instance = await getOrCreateNextInstance(seriesId);
  const viewer = await getCurrentViewer();

  const agendaItem = await prisma.agendaItem.create({
    data: {
      instanceId: instance.id,
      title: `Discuss: ${goal.title}`,
      addedById: viewer?.id ?? null,
      sourceType: "goal",
      sourceGoalId: goal.id,
    },
    include: { instance: { include: { series: true } } },
  });

  return NextResponse.json({ agendaItem });
}
