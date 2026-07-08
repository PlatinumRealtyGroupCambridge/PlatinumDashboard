import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";
import { ALL_SECTIONS, ZOOM_LINK } from "@/lib/sections";
import { formatMeetingDateTime } from "@/lib/format";
import ZoomJoinButton from "@/components/ZoomJoinButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    return <p>No team members have been set up yet.</p>;
  }

  const now = new Date();

  const [mySeries, myOpenTasks, myOverdueTasks] = await Promise.all([
    prisma.meetingSeries.findMany({
      where: { participants: { some: { userId: viewer.id } } },
      include: {
        instances: {
          where: { startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 1,
          include: { agendaItems: true, series: { include: { participants: { include: { user: true } } } } },
        },
      },
    }),
    prisma.task.count({ where: { assigneeId: viewer.id, done: false, archived: false } }),
    prisma.task.count({ where: { assigneeId: viewer.id, done: false, archived: false, dueDate: { lt: now } } }),
  ]);

  const upcoming = mySeries
    .filter((s) => s.instances.length > 0)
    .map((s) => ({ series: s, instance: s.instances[0] }))
    .sort((a, b) => new Date(a.instance.startsAt).getTime() - new Date(b.instance.startsAt).getTime())
    .slice(0, 5);

  const firstName = viewer.name.split(" ")[0];

  return (
    <div>
      <h1 className="page-title">Welcome back, {firstName}</h1>
      <p className="page-sub">
        Your company dashboard. Team and company KPIs come online as we connect QuickBooks,
        Rentvine, and Aptly — Meeting Management is live today.
      </p>

      <div className="section-label">Your snapshot</div>
      <div className="stat-row">
        <div className="stat-tile">
          <div className="label">Open to-dos</div>
          <div className="value">{myOpenTasks}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Overdue tasks</div>
          <div className={"value" + (myOverdueTasks > 0 ? " crit" : "")}>{myOverdueTasks}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Upcoming meetings</div>
          <div className="value">{upcoming.length}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Revenue MTD</div>
          <div className="value" style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 600 }}>
            Coming soon
          </div>
        </div>
      </div>

      <div className="section-label">Dashboards</div>
      <div className="dash-grid">
        {ALL_SECTIONS.map((s) => (
          <Link key={s.id} href={s.href} className="card dash-card">
            <span className="dot" style={{ background: `var(--${s.color})` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dash-card-title">{s.label}</div>
              <div className={"dash-card-sub" + (s.live ? " live" : "")}>
                {s.live ? "Live" : "Coming soon"}
              </div>
            </div>
            <span className="chev">&rsaquo;</span>
          </Link>
        ))}
      </div>

      <div className="section-label">Your upcoming meetings</div>
      {upcoming.length === 0 && <div className="card empty-state">No upcoming meetings.</div>}
      {upcoming.map(({ series, instance }) => {
        const pending = instance.agendaItems.filter((a) => !a.discussed).length;
        return (
          <Link
            key={instance.id}
            href={`/meetings?open=${instance.id}`}
            className="card meeting-card"
          >
            <div className="m-left">
              <span className="dot" style={{ background: `var(--${series.color})` }} />
              <div className="m-info">
                <div className="m-title">{series.name}</div>
                <div className="m-meta">
                  {formatMeetingDateTime(new Date(instance.startsAt))} · {series.durationMins} min ·{" "}
                  {instance.series.participants.map((p) => p.user.name.split(" ")[0]).join(", ")}
                </div>
              </div>
            </div>
            <div className="m-right">
              <ZoomJoinButton zoomLink={ZOOM_LINK} />
              {pending > 0 ? (
                <span className="pill pending">{pending} pending</span>
              ) : (
                <span className="pill none">All clear</span>
              )}
              <span className="chev">&rsaquo;</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
