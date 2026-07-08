import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- date helpers (mirrors the validated prototype's scheduling logic) ----------

function nextWeekday(base: Date, targetDow: number, hour: number, minute: number) {
  const d = new Date(base);
  const diff = (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextMonthlyFirstWeekday(base: Date, targetDow: number, hour: number, minute: number) {
  const d = new Date(base);
  const candidate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (candidate.getDay() !== targetDow) candidate.setDate(candidate.getDate() + 1);
  candidate.setHours(hour, minute, 0, 0);
  return candidate;
}

function buildInstanceDates(startFn: () => Date, count: number, incrementDays: number) {
  const first = startFn();
  const arr = [first];
  for (let i = 1; i < count; i++) {
    const d = new Date(arr[i - 1]);
    d.setDate(d.getDate() + incrementDays);
    arr.push(d);
  }
  return arr;
}

async function main() {
  const now = new Date();

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

  const users: Record<string, { id: string }> = {};
  for (const u of usersData) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, initials: u.initials, color: u.color },
      create: { name: u.name, email: u.email, role: u.role, initials: u.initials, color: u.color },
    });
    users[u.key] = created;
  }

  console.log(`Seeded ${usersData.length} users.`);

  // ---------- meeting series + instances ----------
  // Skip re-seeding series/meetings if they already exist, so re-running
  // `prisma migrate deploy` on every build doesn't duplicate data.
  const existingSeriesCount = await prisma.meetingSeries.count();
  if (existingSeriesCount > 0) {
    console.log("Meeting series already seeded — skipping meeting/task/goal seed data.");
    return;
  }

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

  const seriesSeeds: SeriesSeed[] = [
    {
      key: "s-1on1-matt",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Matt",
      durationMins: 30,
      color: "series-aqua",
      participantKeys: ["tim", "matt"],
      ownerKey: "matt",
      dates: buildInstanceDates(() => nextWeekday(now, 1, 9, 0), 8, 7),
    },
    {
      key: "s-1on1-phong",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Phong",
      durationMins: 30,
      color: "series-violet",
      participantKeys: ["tim", "phong"],
      ownerKey: "phong",
      dates: buildInstanceDates(() => nextWeekday(now, 1, 9, 30), 8, 7),
    },
    {
      key: "s-1on1-jamie",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Jamie",
      durationMins: 30,
      color: "series-magenta",
      participantKeys: ["tim", "jamie"],
      ownerKey: "jamie",
      dates: buildInstanceDates(() => nextWeekday(now, 2, 9, 0), 8, 7),
    },
    {
      key: "s-1on1-jeremey",
      type: "ONE_ON_ONE",
      name: "1-on-1: Tim & Jeremey",
      durationMins: 30,
      color: "series-yellow",
      participantKeys: ["tim", "jeremey"],
      ownerKey: "jeremey",
      dates: buildInstanceDates(() => nextWeekday(now, 2, 9, 30), 8, 7),
    },
    {
      key: "s-team",
      type: "TEAM",
      name: "Weekly Team Meeting",
      durationMins: 60,
      color: "series-blue",
      participantKeys: ["tim", "matt", "phong", "jamie", "jeremey"],
      dates: buildInstanceDates(() => nextWeekday(now, 3, 10, 0), 8, 7),
    },
    {
      key: "s-owner",
      type: "OWNERSHIP",
      name: "Monthly Ownership Meeting",
      durationMins: 60,
      color: "series-violet",
      participantKeys: ["tim", "matt", "phong"],
      dates: buildInstanceDates(() => nextMonthlyFirstWeekday(now, 4, 14, 0), 3, 30),
    },
  ];

  const seriesRecords: Record<string, { id: string }> = {};
  const firstInstanceBySeries: Record<string, { id: string }> = {};

  for (const s of seriesSeeds) {
    const series = await prisma.meetingSeries.create({
      data: {
        type: s.type,
        name: s.name,
        durationMins: s.durationMins,
        color: s.color,
        ownerId: s.ownerKey ? users[s.ownerKey].id : null,
        participants: {
          create: s.participantKeys.map((k) => ({ userId: users[k].id })),
        },
        instances: {
          create: s.dates.map((d) => ({ startsAt: d })),
        },
      },
      include: { instances: { orderBy: { startsAt: "asc" } } },
    });
    seriesRecords[s.key] = series;
    firstInstanceBySeries[s.key] = series.instances[0];
  }

  console.log(`Seeded ${seriesSeeds.length} meeting series.`);

  // ---------- sample agenda items on the first upcoming occurrence of each series ----------
  async function addAgendaItem(seriesKey: string, title: string, addedByKey: string) {
    return prisma.agendaItem.create({
      data: {
        instanceId: firstInstanceBySeries[seriesKey].id,
        title,
        addedById: users[addedByKey].id,
      },
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

  // ---------- sample tasks ----------
  const inDays = (n: number) => new Date(now.getTime() + n * 86400000);

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
      notes: "Confirmed with Phong — budget approved at $42k.",
      createdById: users.tim.id,
    },
  });

  console.log("Seeded sample tasks.");

  // ---------- sample goals ----------
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
