import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminUsersApp from "@/components/AdminUsersApp";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
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
    <AdminUsersApp
      initialUsers={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        initials: u.initials,
        color: u.color,
        isAdmin: u.isAdmin,
        allowedSections: u.allowedSections,
        hasPassword: Boolean(u.passwordHash),
      }))}
      currentUserId={viewer.id}
    />
  );
}
