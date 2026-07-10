export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Terms of Use</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 28 }}>Last updated July 10, 2026</p>

      <p>
        The Platinum Realty Group Corporate Dashboard (&quot;this application&quot;) is provided
        for the internal business use of Platinum Realty Group, LLC and its authorized employees
        only. It is not licensed, offered, or made available for use by any other individual,
        company, or organization.
      </p>

      <p>
        This application is provided &quot;as is&quot; for internal operational purposes.
        Platinum Realty Group, LLC reserves the right to modify, update, or discontinue it at any
        time without notice.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Contact</h2>
      <p>
        Questions about these terms can be directed to{" "}
        <a href="mailto:tim@platinumrealtygroup.com">tim@platinumrealtygroup.com</a>.
      </p>
    </div>
  );
}
