export const dynamic = "force-dynamic";

export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 28 }}>Last updated July 10, 2026</p>

      <p>
        The Platinum Realty Group Corporate Dashboard is an internal tool built for the employees
        of Platinum Realty Group, LLC. It is not a public product, and it is not available for use
        by anyone outside the company.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>What we collect</h2>
      <p>
        We store each employee&apos;s name, email address, and a securely hashed password for
        logging in, along with meeting, task, and goal information employees enter for internal
        company operations. Where connected, we also store a read-only summary of financial data
        — such as maintenance labor billed, trip charges, and related costs — pulled from the
        company&apos;s QuickBooks Online account, used only for internal reporting on this
        dashboard.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>How we use it</h2>
      <p>
        This information is used solely to operate the dashboard for Platinum Realty Group&apos;s
        own internal business operations. We do not sell this data, use it for advertising, or
        share it with any third party outside the ordinary course of running the application
        (e.g. our hosting and database providers, who store data on our behalf and do not use it
        for their own purposes).
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Access</h2>
      <p>Access to this dashboard is restricted to authorized Platinum Realty Group employees via a secure login.</p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Contact</h2>
      <p>
        Questions about this policy can be directed to{" "}
        <a href="mailto:tim@platinumrealtygroup.com">tim@platinumrealtygroup.com</a>.
      </p>
    </div>
  );
}
