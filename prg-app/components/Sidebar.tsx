"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "@/lib/sections";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sidebar" id="sidebar">
      <div className="sidebar-label">Dashboards</div>
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.id}
            href={s.href}
            className={"sidebar-item" + (active ? " active" : "")}
          >
            <span
              className="dot"
              style={{ background: `var(--${s.color})`, width: 8, height: 8, borderRadius: "50%" }}
            />
            <span>{s.label}</span>
            {s.live && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--good)", fontWeight: 700 }}>
                LIVE
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
