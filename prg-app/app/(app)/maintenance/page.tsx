import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { sectionById } from "@/lib/sections";
import MaintenanceDashboard from "@/components/MaintenanceDashboard";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  const section = sectionById("maintenance")!;
  const allowed = viewer.isAdmin || viewer.allowedSections.includes("maintenance");
  if (!allowed) {
    return (
      <div>
        <h1 className="page-title">{section.label}</h1>
        <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
            You don&apos;t have access to this dashboard. Ask an admin to grant it to you on the
            Admin &gt; Users page if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return <MaintenanceDashboard label={section.label} blurb={section.blurb} />;
}
