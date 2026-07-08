import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

const SESSION_COOKIE = "prg_session";
const VIEWER_COOKIE = "prg_viewer";

// --- Shared site password gate (interim, until per-user Google Sign-In) ---

function hash(value: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export function expectedSessionToken() {
  return hash(process.env.SITE_PASSWORD || "");
}

export function checkPassword(candidate: string) {
  const expected = process.env.SITE_PASSWORD || "";
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, expectedSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// --- "Viewing as" interim stand-in for per-user auth ---
// Stores the currently-selected team member's id in a cookie so the app can
// scope "my meetings", filters, etc. the same way the prototype did. This is
// replaced by real per-user identity once Google Sign-In is wired up.

export async function getViewerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VIEWER_COOKIE)?.value ?? null;
}

export async function setViewerId(userId: string) {
  const jar = await cookies();
  jar.set(VIEWER_COOKIE, userId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// Default to whichever team member was seeded first (Tim Andrew, the CEO)
// until the viewer explicitly picks someone from the "Viewing as" switcher.
export async function getCurrentViewer() {
  const id = await getViewerId();
  if (!id) {
    return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  return user ?? prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}
