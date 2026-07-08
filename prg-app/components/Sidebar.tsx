"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_SECTIONS, TEAM_SECTIONS } from "@/lib/sections";

export default function Sidebar() {
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

  return (
    <nav className="sidebar" id="sidebar">
      <div className="sidebar-label">Dashboards</div>
      {DASHBOARD_SECTIONS.map(item)}

      <div className="sidebar-label">Meetings &amp; Tasks</div>
      {TEAM_SECTIONS.map(item)}
    </nav>
  );
}
