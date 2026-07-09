import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

// Bump this any time the recurring meeting schedule below changes — it
// triggers a one-time rebuild of MeetingSeries/MeetingInstance rows (see
// maybeReseedSchedule() at the bottom). Sample tasks/goals are seeded
// separately and are NOT affected by this version bump.
const SCHEDULE_VERSION = "2";

// Duplicated from lib/auth.ts's hashPassword() — this script runs
// standalone via `tsx prisma/seed.ts` (see package.json), not inside a
// Next.js request, so it can't import lib/auth.ts (that file pulls in
// next/headers, which only works inside a Next server). Keep this in sync
// with lib/auth.ts if the algorithm/params ever change, or a password set
// by one won't verify against the other.
const SCRYPT_KEYLEN = 64;
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

// Tim's very first login, before he's had a chance to set his own password
// via Admin > Users. He should change it once he's in — everyone else
// starts with no password at all (can't log in) until Tim sets one for
// them from that same page.
const TIM_INITIAL_PASSWORD = "Platinum-CEO-2026!";

const TZ = "America/New_York";

// ---------- timezone-aware date helpers ----------
// All meeting times are specified in Eastern time (the company's home
// timezone) and need to resolve to the correct UTC instant regardless of
// whether Eastern is currently in EST or EDT, and regardless of what
// timezone the server/build machine itself runs in (Vercel's build/runtime
// defaults to UTC).

// Returns the given Y-M-D/H:M *as observed in `timeZone`*, converted to the
// correct UTC instant. Handles EST/EDT automatically based on the date.
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const asIfUTC = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const inTargetZone = new Date(asIfUTC.toLocaleString("en-US", { timeZone: TZ }));
  const offset = asIfUTC.getTime() - inTargetZone.getTime();
  return new Date(asIfUTC.getTime() + offset);
}

// "Now," expressed as Y/M/D/H/M in the company's local (Eastern) calendar,
// so recurring-meeting math lands on the right Eastern calendar day no
// matter what timezone the build machine itself is in.
function nyNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

// Builds `count` weekly occurrences of `targetDow` (0=Sun..6=Sat) at the
// given Eastern hour/minute, starting from the next such day after today
// (never today itself, so a freshly-seeded series never shows "today").
function buildWeeklyInstances(targetDow: number, hour: number, minute: number, count: number) {
  const now = nyNow();
  const todayUtcMidnight = Date.UTC(now.year, now.month, now.day);
  const todayDow = new Date(todayUtcMidnight).getUTCDay();
  const diff = (targetDow - todayDow + 7) % 7;
  const firstOffset = diff === 0 ? 7 : diff;

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const dayOffset = firstOffset + i * 7;
    const d = new Date(todayUtcMidnight + dayOffset * 86400000);
    dates.push(zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute));
  }
  return dates;
}

// Builds `count` monthly occurrences of the nth `targetDow` (e.g. n=2,
// targetDow=4 → "2nd Thursday") of each of the next `count` months, at the
// given Eastern hour/minute.
function buildMonthlyInstances(n: number, targetDow: number, hour: number, minute: number, count: number) {
  const now = nyNow();
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const monthIndex = now.month + 1 + i; // always start with *next* month
    const year = now.year + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;

    let day = 1;
    let d = new Date(Date.UTC(year, month, day));
    while (d.getUTCDay() !== targetDow) {
      day++;
      d = new Date(Date.UTC(year, month, day));
    }
    day += (n - 1) * 7;

    dates.push(zonedTimeToUtc(year, month, day, hour, minute));
  }
  return dates;
}

async function main() {
  // ---------- team roster ----------
  const usersData = [
    { key: "tim", name: "Tim Andrew", email: "tim@platinumrealtygroup.com", role: "CEO", initials: "TA", color: "series-blue" },
    { key: "matt", name: "Matt Weicker", email: "matt@platinumrealtygroup.com", role: "Property Manager", initials: "MW", color: "series-aqua" },
    { key: "phong", name: "Phong Smith", email: "phong@platinumrealtygroup.com", role: "CFO", initials: "PS", color: "series-violet" },
    { key: "jamie", name: "Jamie Smith", email: "jamie@platinumrealtygroup.com", role: "Leasing Specialist", initials: "JS", color: "series-magenta" },
    {
      key: "jeremey",
      name: "Jeremey Poe",
      email: "jeremey@platinumrealtygroup.com",
      role: "Director of Operations & Business Development",
      initials: "JP",
      color: "series-yellow",
    },
  ];

  // isAdmin/passwordHash are deliberately never touched by this upsert
  // (either branch) — this runs on every deploy (see package.json's build
  // script), and update-ing them here would silently overwrite a password
  // an admin has since set (or reset) from the Admin > Users page, or flip
  // someone's admin status back to whatever it was at seed time.
  // Everything else (name/role/initials/color) is fine to keep in sync
  // with this file on every deploy.
  const users: Record<string, { id: string; passwordHash: string | null }> = {};
  for (const u of usersData) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, initials: u.initials, color: u.color },
      create: { name: u.name, email: u.email, role: u.role, initials: u.initials, color: u.color },
    });
    users[u.key] = row;
  }
  console.log(`Seeded ${usersData.length} users.`);

  // One-time bootstrap: give Tim's account a password and admin rights if
  // it doesn't already have one. This is intentionally a separate step
  // from the upsert above (not folded into its `create` branch) because
  // Tim's row already existed from an earlier deploy, before passwordHash/
  // isAdmin existed on the schema — the upsert above always took the
  // `update` branch for him and so would never have run a `create`. Once
  // this has set his password once, it's skipped forever after (even
  // across a fresh empty database, this only ever fires the first time).
  const tim = users["tim"];
  if (tim && !tim.passwordHash) {
    await prisma.user.update({
      where: { id: tim.id },
      data: { isAdmin: true, passwordHash: hashPassword(TIM_INITIAL_PASSWORD) },
    });
    console.log(`Bootstrapped tim@platinumrealtygroup.com with a temporary admin password.`);
  }

  await maybeReseedSchedule(users);
  await seedSampleTasksAndGoals(users);
}

// ---------- meeting schedule (version-gated rebuild) ----------

type SeriesSeed = {
  key: string;
  type: "ONE_ON_ONE" | "TEAM" | "OWNERSHIP";
  name: string;
  durationMins: number;
  color: string;
  participantKeys: string[];
  ownerKey?: string;
  dates: Date[];
};

async function maybeReseedSchedule(users: Record<string, { id: string }>) {
  const meta = await prisma.appMeta.findUnique({ where: { key: "scheduleVersion" } });
  if (meta?.value === SCHEDULE_VERSION) {
    console.log("Meeting schedule already up to date — skipping series reseed.");
    return;
  }

  const seriesSeeds: SeriesSeed[] = [
    {
      key: "s-1on1-matt",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Matt",
      durationMins: 30,
      color: "series-aqua",
      participantKeys: ["tim", "matt"],
      ownerKey: "matt",
      dates: buildWeeklyInstances(2, 13, 0, 8), // Tuesdays 1:00pm ET
    },
    {
      key: "s-1on1-phong",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Phong",
      durationMins: 30,
      color: "series-violet",
      participantKeys: ["tim", "phong"],
      ownerKey: "phong",
      dates: buildWeeklyInstances(5, 12, 30, 8), // Fridays 12:30pm ET
    },
    {
      key: "s-1on1-jamie",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Jamie",
      durationMins: 30,
      color: "series-magenta",
      participantKeys: ["tim", "jamie"],
      ownerKey: "jamie",
      dates: buildWeeklyInstances(5, 13, 30, 8), // Fridays 1:30pm ET
    },
    {
      key: "s-1on1-jeremey",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Jeremey",
      durationMins: 30,
      color: "series-yellow",
      participantKeys: ["tim", "jeremey"],
      ownerKey: "jeremey",
      dates: buildWeeklyInstances(5, 14, 0, 8), // Fridays 2:00pm ET
    },
    {
      key: "s-team",
      type: "TEAM",
      name: "Weekly Team Meeting",
      durationMins: 60,
      color: "series-blue",
      participantKeys: ["tim", "matt", "phong", "jamie", "jeremey"],
      dates: buildWeeklyInstances(2, 14, 0, 8), // Tuesdays 2:00pm ET
    },
    {
      key: "s-owner",
      type: "OWNERSHIP",
      name: "Monthly Ownership Meeting",
      durationMins: 60,
      color: "series-violet",
      participantKeys: ["tim", "matt", "phong"],
      dates: buildMonthlyInstances(2, 4, 13, 0, 3), // 2nd Thursday, 1:00pm ET
    },
  ];

  // Deleting a MeetingSeries cascades to its MeetingInstance rows, which
  // cascades to their AgendaItem rows. Any Task/Goal that had been linked
  // to one of those agenda items simply has that link cleared (its
  // agendaItemId / meetingRefs get set to null) — the task/goal itself is
  // untouched. This is a clean way to re-lay-down the correct schedule, at
  // the cost of clearing out agenda notes/checkmarks on the meetings being
  // rescheduled.
  await prisma.meetingSeries.deleteMany({});
  console.log("Cleared existing meeting series ahead of schedule rebuild.");

  const firstInstanceBySeries: Record<string, { id: string }> = {};

  for (const s of seriesSeeds) {
    const series = await prisma.meetingSeries.create({
      data: {
        type: s.type,
        name: s.name,
        durationMins: s.durationMins,
        color: s.color,
        ownerId: s.ownerKey ? users[s.ownerKey].id : null,
        participants: { create: s.participantKeys.map((k) => ({ userId: users[k].id })) },
        instances: { create: s.dates.map((d) => ({ startsAt: d })) },
      },
      include: { instances: { orderBy: { startsAt: "asc" } } },
    });
    firstInstanceBySeries[s.key] = series.instances[0];
  }
  console.log(`Seeded ${seriesSeeds.length} meeting series with the corrected schedule.`);

  async function addAgendaItem(seriesKey: string, title: string, addedByKey: string) {
    return prisma.agendaItem.create({
      data: { instanceId: firstInstanceBySeries[seriesKey].id, title, addedById: users[addedByKey].id },
    });
  }

  await addAgendaItem("s-team", "Review Q3 leasing pipeline & vacancy list", "matt");
  await addAgendaItem("s-team", "New HVAC maintenance vendor proposal", "jeremey");
  await addAgendaItem("s-team", "Website redesign timeline check-in", "jamie");
  await addAgendaItem("s-1on1-matt", "Staffing plan for the new Somerville portfolio", "matt");
  await addAgendaItem("s-1on1-matt", "Vacation request — week of Aug 10", "matt");
  await addAgendaItem("s-1on1-phong", "June financials walkthrough", "tim");
  await addAgendaItem("s-1on1-phong", "QBO API integration budget approval", "phong");
  await addAgendaItem("s-1on1-jamie", "Lead response time on Zillow inquiries", "tim");
  await addAgendaItem("s-1on1-jeremey", "Vendor contract renewals due in August", "jeremey");
  await addAgendaItem("s-owner", "Q3 owner distribution timing", "phong");
  await addAgendaItem("s-owner", "Cambridge duplex acquisition — next steps", "tim");
  console.log("Seeded sample agenda items.");

  await prisma.appMeta.upsert({
    where: { key: "scheduleVersion" },
    update: { value: SCHEDULE_VERSION },
    create: { key: "scheduleVersion", value: SCHEDULE_VERSION },
  });
}

// ---------- sample tasks & goals (independent of the schedule version) ----------

async function seedSampleTasksAndGoals(users: Record<string, { id: string }>) {
  const existingTasks = await prisma.task.count();
  const existingGoals = await prisma.goal.count();
  if (existingTasks > 0 || existingGoals > 0) {
    console.log("Sample tasks/goals already exist — skipping.");
    return;
  }

  const inDays = (n: number) => new Date(Date.now() + n * 86400000);

  await prisma.task.create({
    data: { title: "Send Q2 financial summary to owners", assigneeId: users.phong.id, dueDate: inDays(1), createdById: users.phong.id },
  });
  await prisma.task.create({
    data: { title: "Get 3 quotes from HVAC vendors", assigneeId: users.jeremey.id, dueDate: inDays(6), createdById: users.jeremey.id },
  });
  await prisma.task.create({
    data: { title: "Draft new sign-on packet for leasing tours", assigneeId: users.jamie.id, dueDate: inDays(14), createdById: users.jamie.id },
  });
  await prisma.task.create({
    data: {
      title: "Approve Somerville portfolio staffing budget",
      assigneeId: users.tim.id,
      dueDate: inDays(-5),
      done: true,
      archived: true,
      archivedAt: new Date(),
      notes: "Confirmed with Phong — budget approved at $42k.",
      createdById: users.tim.id,
    },
  });
  console.log("Seeded sample tasks.");

  await prisma.goal.create({
    data: { title: "Increase average Google review rating to 4.8", assigneeId: users.tim.id, dueDate: inDays(84), status: "GOOD", createdById: users.tim.id },
  });
  await prisma.goal.create({
    data: { title: "Reduce average maintenance response time to under 24h", assigneeId: users.jeremey.id, dueDate: inDays(54), status: "WARN", createdById: users.jeremey.id },
  });
  await prisma.goal.create({
    data: { title: "Fill Cambridge duplex vacancy", assigneeId: users.jamie.id, dueDate: inDays(17), status: "CRIT", createdById: users.jamie.id },
  });
  await prisma.goal.create({
    data: { title: "Finalize QBO + Rentvine dashboard data pipeline", assigneeId: users.phong.id, dueDate: inDays(38), status: "GOOD", createdById: users.phong.id },
  });
  console.log("Seeded sample goals.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
