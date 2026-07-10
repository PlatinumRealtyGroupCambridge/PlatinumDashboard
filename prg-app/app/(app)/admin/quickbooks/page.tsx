import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { getQuickBooksConnectionStatus } from "@/lib/quickbooks-auth";

export const dynamic = "force-dynamic";

export default async function QuickBooksAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  if (!viewer.isAdmin) {
    return (
      <div>
        <h1 className="page-title">QuickBooks Connection</h1>
        <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
            You don&apos;t have access to this page.
          </p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const status = await getQuickBooksConnectionStatus();

  return (
    <div>
      <h1 className="page-title">QuickBooks Connection</h1>
      <p className="page-sub">
        Connects the live dashboard to QuickBooks Online so the Maintenance Dashboard (and future
        dashboards) can pull real numbers instead of sample data. This is a read-only connection —
        nothing on this dashboard can create, change, or send anything in your QuickBooks account.
      </p>

      {params.connected === "1" && (
        <div className="saved-tag" style={{ marginBottom: 16 }}>
          Connected successfully.
        </div>
      )}
      {params.disconnected === "1" && (
        <div className="login-error" style={{ marginBottom: 16 }}>
          Disconnected from QuickBooks.
        </div>
      )}
      {params.error === "1" && (
        <div className="login-error" style={{ marginBottom: 16 }}>
          Something went wrong connecting to QuickBooks — please try again.
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        {status.connected ? (
          <>
            <p style={{ margin: "0 0 4px" }}>
              <span className="status-badge good">Connected</span>
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 16px" }}>
              Connected {status.connectedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}.
            </p>
            <a className="btn" href="/api/quickbooks/connect">
              Reconnect
            </a>
          </>
        ) : (
          <>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: "0 0 16px" }}>Not connected yet.</p>
            <a className="btn primary" href="/api/quickbooks/connect">
              Connect to QuickBooks
            </a>
          </>
        )}
      </div>
    </div>
  );
}
