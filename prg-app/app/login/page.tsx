export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const error = params.error === "1";
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand">
          <img className="brand-icon" src="/logo-icon.png" alt="Platinum Realty Group" />
          <div className="brand-text" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="name">Platinum Realty Group</div>
            <div className="subname">Corporate Dashboard</div>
          </div>
        </div>
        <form method="POST" action="/api/login">
          <input type="hidden" name="next" value={next} />
          {error && <div className="login-error">Incorrect email or password. Please try again.</div>}
          <input
            type="email"
            name="email"
            placeholder="Email address"
            autoComplete="username"
            autoFocus
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            required
          />
          <button type="submit" className="btn primary">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
