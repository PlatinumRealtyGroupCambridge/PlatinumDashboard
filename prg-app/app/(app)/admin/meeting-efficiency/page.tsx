import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MeetingEfficiencyApp from "@/components/MeetingEfficiencyApp";

export const dynamic = "force-dynamic";

export default async function MeetingEfficiencyPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  if (!viewer.isAdmin) {
    return (
      <div>
        <h1 className="page-title">Admin</h1>
        <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
            You don&apos;t have access to this page.
          </p>
        </div>
      </div>
    );
  }

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <MeetingEfficiencyApp
      users={users.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.color }))}
    />
  );
}
