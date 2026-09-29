import { useState } from "react";
import { apiPost, setSessionUser, setToken, type LoginResult } from "../api";

export function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(): Promise<void> {
    const name = username.trim();
    if (!name || !password) {
      setError("Enter a username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<LoginResult>("/auth/login", { username: name, password }, { skipAuth: true });
      setSessionUser({
        id: result.user.id,
        username: result.user.username,
        displayName: result.user.displayName,
        roles: result.user.roles ?? [],
        permissions: result.user.permissions ?? [],
      });
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-story">
        <p className="login-kicker">Software Engineering Twin</p>
        <h1>Your software has a memory.</h1>
        <p className="login-lead">
          SE Twin keeps a living record of a product and the work that builds it. Stories, design, code, and tests stay
          linked from the first prompt through review.
        </p>
        <ul className="login-points">
          <li>AI proposes drafts. People in the right role approve them.</li>
          <li>Every change remains traceable to the story it came from.</li>
          <li>Nothing is authoritative until a human accepts it.</li>
        </ul>
      </section>
      <div className="login-aside">
      <form
        className="panel login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void login();
        }}
      >
        <h2>Sign in</h2>
        <p>Continue to the dashboard.</p>
        <label className="login-field">
          <span className="muted">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="login-field">
          <span className="muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Log in"}
        </button>
      </form>
      </div>
    </div>
  );
}
