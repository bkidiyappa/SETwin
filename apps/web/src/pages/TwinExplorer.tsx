import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, getToken, onTokenChange } from "../api";

type Artifact = {
  key: string;
  type: string;
  projectKey: string;
  currentVersion: { version: number; title: string; workflowState: string };
};

export function TwinExplorerPage() {
  const [rows, setRows] = useState<Artifact[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!getToken()) {
        setRows([]);
        setError("Sign in on the Dashboard first, then return here.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const artifacts = await apiGet<Artifact[]>("/artifacts");
        if (!cancelled) {
          setRows(artifacts);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return onTokenChange(() => {
      void load();
    });
  }, []);

  return (
    <div>
      <h1>Twin Explorer</h1>
      <p>Browse artifacts and workflow state.</p>
      {error ? (
        <p className="error">
          {error}{" "}
          {!getToken() ? (
            <Link to="/" style={{ color: "inherit", textDecoration: "underline" }}>
              Go to Dashboard
            </Link>
          ) : null}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading…</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Type</th>
              <th>Project</th>
              <th>Version</th>
              <th>Workflow</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>{row.type}</td>
                <td>{row.projectKey}</td>
                <td>v{row.currentVersion.version}</td>
                <td>{row.currentVersion.workflowState}</td>
                <td>{row.currentVersion.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && rows.length === 0 ? (
          <p className="muted">No artifacts yet. Create one with the CLI, then refresh this page.</p>
        ) : null}
      </div>
    </div>
  );
}
