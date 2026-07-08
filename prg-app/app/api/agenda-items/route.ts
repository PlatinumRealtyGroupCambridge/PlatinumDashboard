import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const instanceId = body?.instanceId;
  const title = (body?.title || "").trim();
  if (!instanceId || !title) {
    return NextResponse.json({ error: "instanceId and title are required" }, { status: 400 });
  }
  const viewer = await getCurrentViewer();
  const item = await prisma.agendaItem.create({
    data: {
      instanceId,
      title,
      addedById: viewer?.id ?? null,
    },
    include: { addedBy: true, tasks: true },
  });
  return NextResponse.json({ item });
}
