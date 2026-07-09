import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_SECTIONS } from "@/lib/sections";

const VALID_SECTION_IDS = new Set(DASHBOARD_SECTIONS.map((s) => s.id));

// Cycled through in creation order so new teammates get a readable,
// distinct-ish color for their initials badge without an admin having to
// pick one.
const COLOR_CYCLE = [
  "series-blue",
  "series-aqua",
  "series-yellow",
  "series-green",
  "series-violet",
  "series-red",
  "series-magenta",
  "series-orange",
];

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sanitizeSections(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === "string" && VALID_SECTION_IDS.has(s));
}

export async function POST(req: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || !viewer.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const isAdmin = Boolean(body?.isAdmin);
  const allowedSections = sanitizeSections(body?.allowedSections);

  if (!name || !email || !role || !password) {
    return NextResponse.json(
      { error: "Name, email, role, and an initial password are all required." },
      { status: 400 }
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const userCount = await prisma.user.count();

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      initials: initialsFor(name),
      color: COLOR_CYCLE[userCount % COLOR_CYCLE.length],
      passwordHash: hashPassword(password),
      isAdmin,
      allowedSections,
    },
  });

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
      hasPassword: true,
    },
  });
}
