import { notFound } from "next/navigation";
import { DASHBOARD_SECTIONS } from "@/lib/sections";

export function generateStaticParams() {
  return DASHBOARD_SECTIONS.map((s) => ({ section: s.id }));
}

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: sectionId } = await params;
  const section = DASHBOARD_SECTIONS.find((s) => s.id === sectionId);
  if (!section) notFound();

  return (
    <div>
      <h1 className="page-title">{section.label}</h1>
      <p className="page-sub">{section.blurb}</p>
      <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--page)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "6px 14px",
          }}
        >
          <span
            className="dot"
            style={{ background: `var(--${section.color})`, width: 8, height: 8, borderRadius: "50%" }}
          />
          Coming soon
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 14, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
          This dashboard will connect to QuickBooks Online, Rentvine, and Aptly to show live
          company and employee KPIs here.
        </p>
      </div>
    </div>
  );
}
