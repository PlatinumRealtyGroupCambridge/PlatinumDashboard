import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only dev notes shown at the bottom of every page (see
// components/PageNotes.tsx, rendered from app/(app)/layout.tsx), scoped
// per page by pageKey (the pathname the note was left on).
export async function GET(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const pageKey = new URL(req.url).searchParams.get("pageKey");
  if (!pageKey) return NextResponse.json({ error: "pageKey is required" }, { status: 400 });

  const notes = await prisma.pageNote.findMany({
    where: { pageKey },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
      createdByName: n.createdBy?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const pageKey = typeof body?.pageKey === "string" ? body.pageKey : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!pageKey || !content) {
    return NextResponse.json({ error: "pageKey and content are required" }, { status: 400 });
  }

  const note = await prisma.pageNote.create({
    data: { pageKey, content, createdById: viewer.id },
  });

  return NextResponse.json({
    note: { id: note.id, content: note.content, createdAt: note.createdAt.toISOString(), createdByName: viewer.name },
  });
}
