import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["GOOD", "WARN", "CRIT"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: { status?: (typeof VALID_STATUSES)[number]; notes?: string } = {};
  if (typeof body?.status === "string" && (VALID_STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status;
  }
  if (typeof body?.notes === "string") data.notes = body.notes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const goal = await prisma.goal.update({ where: { id }, data, include: { assignee: true } });
  return NextResponse.json({ goal });
}
