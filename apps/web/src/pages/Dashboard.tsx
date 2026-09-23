import { useEffect, useState } from "react";
import {
  apiGet,
  apiPost,
  clearToken,
  getSessionUser,
  getToken,
  setSessionUser,
  setToken,
  type LoginResult,
} from "../api";

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
  const [sessionUser, setSessionLabel] = useState(getSessionUser()?.username ?? "");
  const [sessionRoles, setSessionRoles] = useState((getSessionUser()?.roles ?? []).join(", "));
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
    apiGet<{ username: string; displayName: string; roles: string[]; permissions: string[] }>("/auth/me")
      .then((user) => {
        setSessionUser({
          username: user.username,
          displayName: user.displayName,
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
        });
        setSessionLabel(user.username);
        setSessionRoles((user.roles ?? []).join(", "));
      })
      .catch(() => setSessionLabel(""));
  }, [token, message]);

  async function login(): Promise<void> {
    setError("");
    setMessage("");
    try {
      const result = await apiPost<LoginResult>("/auth/login", { username, password }, { skipAuth: true });
      setToken(result.token);
      setTokenInput(result.token);
      setSessionUser({
        id: result.user.id,
        username: result.user.username,
        displayName: result.user.displayName,
        roles: result.user.roles ?? [],
        permissions: result.user.permissions ?? [],
      });
      setSessionLabel(result.user.username);
      setSessionRoles((result.user.roles ?? []).join(", "));
      setMessage(`Logged in as ${result.user.username} (${(result.user.roles ?? []).join(", ")})`);
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
          Twin Explorer, Reviews, Audit, and AI activity require a session. Dashboard status alone does not.
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
              setSessionLabel("");
              setSessionRoles("");
              setMessage("Signed out");
            }}
          >
            Sign out
          </button>
        </div>
        {sessionUser ? (
          <p>
            Signed in as <strong>{sessionUser}</strong>
            {sessionRoles ? <span className="muted"> · roles: {sessionRoles}</span> : null}
          </p>
        ) : (
          <p className="muted">Not signed in</p>
        )}
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
