import { useEffect, useState } from "react";
import { apiGet, getToken, setToken } from "../api";

type Status = {
  name: string;
  version: string;
  databaseReachable: boolean;
  initialized: boolean;
};

export function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setTokenInput] = useState(getToken());
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Status>("/status")
      .then(setStatus)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Living engineering twin status and session.</p>
      <div className="toolbar">
        <input
          value={token}
          onChange={(event) => setTokenInput(event.target.value)}
          placeholder="SETWIN session token"
          style={{ minWidth: "280px" }}
        />
        <button
          type="button"
          onClick={() => {
            setToken(token);
            setError("");
          }}
        >
          Save token
        </button>
      </div>
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
