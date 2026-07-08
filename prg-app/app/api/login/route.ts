import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");

  if (!checkPassword(password)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    if (next && next !== "/login") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  await createSession();
  const dest = next && next.startsWith("/") && !next.startsWith("/login") ? next : "/";
  return NextResponse.redirect(new URL(dest, req.url), { status: 303 });
}
