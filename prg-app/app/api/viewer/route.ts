import { NextRequest, NextResponse } from "next/server";
import { setViewerId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  await setViewerId(userId);
  return NextResponse.json({ ok: true });
}
