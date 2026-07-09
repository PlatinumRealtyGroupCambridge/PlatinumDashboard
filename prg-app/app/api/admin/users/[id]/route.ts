import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_SECTIONS } from "@/lib/sections";

const VALID_SECTION_IDS = new Set(DASHBOARD_SECTIONS.map((s) => s.id));

function sanitizeSections(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === "string" && VALID_SECTION_IDS.has(s));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const data: {
    name?: string;
    email?: string;
    role?: string;
    isAdmin?: boolean;
    allowedSections?: string[];
    passwordHash?: string;
    sessionVersion?: { increment: number };
  } = {};

  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.role === "string" && body.role.trim()) data.role = body.role.trim();
  if (typeof body?.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
    }
    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) {
        return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
      }
    }
    data.email = email;
  }
  if (Array.isArray(body?.allowedSections)) {
    data.allowedSections = sanitizeSections(body.allowedSections);
  }

  // Never let the last remaining admin get demoted — that would lock
  // everyone out of this page with no way back in short of a database
  // edit.
  if (typeof body?.isAdmin === "boolean" && body.isAdmin !== target.isAdmin) {
    if (target.isAdmin && !body.isAdmin) {
      const adminCount = await prisma.user.count({ where: { isAdmin: true } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "You can't remove admin from the last remaining admin." },
          { status: 400 }
        );
      }
    }
    data.isAdmin = body.isAdmin;
  }

  // A new password immediately invalidates any session already signed in
  // as this user (see sessionVersion in lib/auth.ts) — important if this
  // reset is happening because someone left the company or forgot their
  // password on a shared device.
  if (typeof body?.password === "string" && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    data.passwordHash = hashPassword(body.password);
    data.sessionVersion = { increment: 1 };
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({ where: { id }, data });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      initials: user.initials,
      color: user.color,
      isAdmin: user.isAdmin,
      allowedSections: user.allowedSections,
      hasPassword: Boolean(user.passwordHash),
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  if (id === viewer.id) {
    return NextResponse.json({ error: "You can't delete your own account while logged in as it." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "You can't delete the last remaining admin." }, { status: 400 });
    }
  }

  // Tasks/goals this person created or was assigned, and agenda items they
  // added, aren't deleted — they just become unassigned/unattributed
  // (those fields are already optional). Their meeting participation rows
  // are removed since MeetingParticipant.userId is required and can't be
  // left dangling. Any Meeting Efficiency rows they marked as an admin keep
  // existing (it's the attendee's record, not the marking admin's) but lose
  // the "marked by" attribution. ChatFollowUp/ChatMessage rows, and this
  // person's own MeetingAttendance rows as an attendee, cascade-delete
  // automatically at the database level (see schema.prisma).
  await prisma.$transaction([
    prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
    prisma.task.updateMany({ where: { createdById: id }, data: { createdById: null } }),
    prisma.goal.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
    prisma.goal.updateMany({ where: { createdById: id }, data: { createdById: null } }),
    prisma.agendaItem.updateMany({ where: { addedById: id }, data: { addedById: null } }),
    prisma.meetingSeries.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
    prisma.meetingAttendance.updateMany({ where: { markedById: id }, data: { markedById: null } }),
    prisma.meetingParticipant.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
