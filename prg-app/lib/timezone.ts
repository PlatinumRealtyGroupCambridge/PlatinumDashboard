// Converts a Y-M-D/H:M *as observed in `timeZone`* into the correct UTC
// instant, automatically handling that zone's daylight-saving offset for
// that particular date (e.g. EST vs EDT). Used anywhere a person specifies
// a meeting time in the company's local time (America/New_York) that needs
// to be stored as the real UTC instant Prisma's DateTime columns expect —
// app/api/meetings/route.ts (the "+ New meeting" button) and
// lib/chat-bot.ts (the create_meeting Google Chat tool).
//
// This is a duplicate of the same function in prisma/seed.ts (which can't
// import from here — see the comment there) — keep the two in sync if you
// ever change this.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = "America/New_York"
) {
  const asIfUTC = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const inTargetZone = new Date(asIfUTC.toLocaleString("en-US", { timeZone }));
  const offset = asIfUTC.getTime() - inTargetZone.getTime();
  return new Date(asIfUTC.getTime() + offset);
}

// Today's calendar date as observed in the company's home timezone
// (Eastern), as a "YYYY-MM-DD" string. Deliberately NOT `new
// Date().toISOString().slice(0, 10)` — this code runs server-side on
// Vercel, whose Node runtime defaults to UTC, so a plain UTC "today" would
// read as tomorrow's date for a chunk of every Eastern evening (e.g. 8pm
// ET is already after midnight UTC). Used by lib/chat-bot.ts to tell the
// model what "today" and relative phrases like "next Friday" mean.
export function nyTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
