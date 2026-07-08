import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentViewer } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ViewerSwitcher from "@/components/ViewerSwitcher";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [users, viewer] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentViewer(),
  ]);

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <img className="brand-icon" src="/logo-icon.png" alt="Platinum Realty Group" />
          <div className="brand-text">
            <div className="name">Platinum Realty Group</div>
            <div className="subname">Corporate Dashboard</div>
          </div>
        </Link>
        <div className="topbar-right">
          {viewer && (
            <ViewerSwitcher
              users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
              currentUserId={viewer.id}
            />
          )}
          <form method="POST" action="/api/logout">
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="app-shell">
        <Sidebar />
        <main id="app">{children}</main>
      </div>
    </>
  );
}
