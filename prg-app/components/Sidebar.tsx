"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_SECTIONS, TEAM_SECTIONS } from "@/lib/sections";

export default function Sidebar({
  isAdmin,
  allowedSections,
}: {
  isAdmin: boolean;
  allowedSections: string[];
}) {
  const pathname = usePathname();

  const item = (s: (typeof DASHBOARD_SECTIONS)[number]) => {
    const active = pathname === s.href || pathname.startsWith(s.href + "/");
    return (
      <Link key={s.id} href={s.href} className={"sidebar-item" + (active ? " active" : "")}>
        <span
          className="dot"
          style={{ background: `var(--${s.color})`, width: 8, height: 8, borderRadius: "50%" }}
        />
        <span>{s.label}</span>
      </Link>
    );
  };

  // Admins see every KPI dashboard regardless of their own allowedSections
  // list; everyone else only sees the ones an admin has checked off for
  // them on the Admin > Users page.
  const visibleDashboards = isAdmin
    ? DASHBOARD_SECTIONS
    : DASHBOARD_SECTIONS.filter((s) => allowedSections.includes(s.id));

  return (
    <nav className="sidebar" id="sidebar">
      {visibleDashboards.length > 0 && (
        <>
          <div className="sidebar-label">Dashboards</div>
          {visibleDashboards.map(item)}
        </>
      )}

      <div className="sidebar-label">Meetings &amp; Tasks</div>
      {TEAM_SECTIONS.map(item)}

      {isAdmin && (
        <>
          <div className="sidebar-label">Admin</div>
          <Link
            href="/admin/users"
            className={"sidebar-item" + (pathname.startsWith("/admin") ? " active" : "")}
          >
            <span className="dot" style={{ background: "var(--text-muted)", width: 8, height: 8, borderRadius: "50%" }} />
            <span>Manage Users</span>
          </Link>
        </>
      )}
    </nav>
  );
}
