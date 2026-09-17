import { useEffect, useState } from "react";
import { apiGet, apiPost, clearToken, getToken, setToken, type LoginResult } from "../api";

type Status = {
  name: string;
  version: string;
  databaseReachable: boolean;
  initialized: boolean;
};

export function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setTokenInput] = useState(getToken());
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [sessionUser, setSessionUser] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Status>("/status")
      .then(setStatus)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    apiGet<{ username: string }>("/auth/me")
      .then((user) => setSessionUser(user.username))
      .catch(() => setSessionUser(""));
  }, [token, message]);

  async function login(): Promise<void> {
    setError("");
    setMessage("");
    try {
      const result = await apiPost<LoginResult>("/auth/login", { username, password }, { skipAuth: true });
      setToken(result.token);
      setTokenInput(result.token);
      setSessionUser(result.user.username);
      setMessage(`Logged in as ${result.user.username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Living engineering twin status and session.</p>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="muted">Sign in</div>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          Twin Explorer, Reviews, Approvals, Audit, and AI activity require a session. Dashboard status alone does not.
        </p>
        <div className="toolbar">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="username"
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="password"
            autoComplete="current-password"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void login();
              }
            }}
          />
          <button type="button" onClick={() => void login()}>
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              clearToken();
              setTokenInput("");
              setSessionUser("");
              setMessage("Signed out");
            }}
          >
            Sign out
          </button>
        </div>
        {sessionUser ? <p>Signed in as <strong>{sessionUser}</strong></p> : <p className="muted">Not signed in</p>}
        {message ? <p>{message}</p> : null}
      </div>

      <details>
        <summary className="muted">Advanced: paste CLI token</summary>
        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <input
            value={token}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="stw_… from data/session.json"
            style={{ minWidth: "280px" }}
          />
          <button
            type="button"
            onClick={() => {
              setToken(token);
              setError("");
              setMessage("Token saved");
            }}
          >
            Save token
          </button>
        </div>
      </details>

      {error ? <p className="error">{error}</p> : null}
      <div className="grid">
        <div className="panel">
          <div className="muted">Product</div>
          <div className="stat">{status?.name ?? "…"}</div>
          <div>{status?.version}</div>
        </div>
        <div className="panel">
          <div className="muted">Database</div>
          <div className="stat">{status?.databaseReachable ? "up" : "down"}</div>
        </div>
        <div className="panel">
          <div className="muted">Initialized</div>
          <div className="stat">{status?.initialized ? "yes" : "no"}</div>
        </div>
      </div>
    </div>
  );
}
