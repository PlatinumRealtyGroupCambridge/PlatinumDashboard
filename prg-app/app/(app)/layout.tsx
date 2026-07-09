import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    redirect("/login");
  }

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
          <div className="current-user-chip">
            <span className="current-user-name">{viewer.name}</span>
            <span className="current-user-role">{viewer.role}</span>
          </div>
          <form method="POST" action="/api/logout">
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="app-shell">
        <Sidebar isAdmin={viewer.isAdmin} allowedSections={viewer.allowedSections} />
        <main id="app">{children}</main>
      </div>
    </>
  );
}
