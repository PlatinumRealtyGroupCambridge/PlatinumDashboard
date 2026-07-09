import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

const SESSION_COOKIE = "prg_session";

function sessionSecret() {
  return process.env.SESSION_SECRET || "dev-secret";
}

// --- password hashing ---
// Node's built-in scrypt — no extra dependency to install (we can't run npm
// in the sandbox this app is developed in, so anything we can get from
// Node's standard library instead of a new package is one less thing that
// can fail at build time). Stored as "salt:hash", both hex.
//
// IMPORTANT: prisma/seed.ts duplicates this exact function (it runs as a
// standalone script, not inside Next, so it can't import this file — see
// the comment there). If you change the algorithm/params here, update the
// copy in seed.ts to match, or passwords set by one won't verify against
// the other.
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// --- signed session cookie ---
// Cookie value: "<userId>.<sessionVersion>.<issuedAtMs>.<hmacHex>". The
// HMAC covers the first three fields so nobody can forge a cookie or bump
// their own sessionVersion without knowing SESSION_SECRET. Middleware
// verifies the same signature on Vercel's Edge runtime (which doesn't have
// Node's crypto module) using the Web Crypto equivalent — see the matching
// function in middleware.ts. If you change this format, update that copy
// too.
function signPayload(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function buildSessionCookieValue(userId: string, sessionVersion: number) {
  const payload = `${userId}.${sessionVersion}.${Date.now()}`;
  return `${payload}.${signPayload(payload)}`;
}

// Verifies a cookie value's signature and returns the userId/sessionVersion
// it was issued for, or null if missing/tampered/malformed. This does NOT
// check the value against the database — callers that need to know whether
// the session is still valid for a real, still-existing user with a
// matching sessionVersion should use getCurrentViewer() below instead.
function verifySessionCookieValue(value: string | undefined): { userId: string; sessionVersion: number } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [userId, versionStr, issuedAtStr, sig] = parts;
  const payload = `${userId}.${versionStr}.${issuedAtStr}`;
  const expectedSig = signPayload(payload);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const sessionVersion = Number(versionStr);
  if (!userId || Number.isNaN(sessionVersion)) return null;
  return { userId, sessionVersion };
}

export async function createUserSession(userId: string, sessionVersion: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, buildSessionCookieValue(userId, sessionVersion), {
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

// The currently logged-in user, freshly read from the database (so a
// permission change or password reset an admin just made takes effect on
// the very next page load, not just the next login) — or null if there's
// no session, the account was deleted, or the session was invalidated by a
// password reset (sessionVersion mismatch). Every page under app/(app)
// should treat a null return as "not logged in" and redirect to /login.
export async function getCurrentViewer() {
  const jar = await cookies();
  const parsed = verifySessionCookieValue(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;

  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user) return null;
  if (user.sessionVersion !== parsed.sessionVersion) return null;
  return user;
}
