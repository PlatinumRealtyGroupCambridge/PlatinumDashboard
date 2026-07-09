import { NextRequest, NextResponse } from "next/server";
import { createUserSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");

  const fail = () => {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    if (next && next !== "/login") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  };

  if (!email || !password) return fail();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail();
  }

  await createUserSession(user.id, user.sessionVersion);
  const dest = next && next.startsWith("/") && !next.startsWith("/login") ? next : "/";
  return NextResponse.redirect(new URL(dest, req.url), { status: 303 });
}
