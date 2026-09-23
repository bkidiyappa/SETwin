import { useEffect, useState } from "react";
import { apiGet } from "../api";

type AiAction = {
  id: string;
  provider: string;
  model: string;
  task: string;
  status: string;
  error?: string;
  createdAt: string;
};

export function AiActivityPage() {
  const [rows, setRows] = useState<AiAction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<AiAction[]>("/ai/actions")
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>AI activity</h1>
      <p>Gateway calls across providers and tasks.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Model</th>
              <th>Task</th>
              <th>Status</th>
              <th>Error</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.provider}</td>
                <td>{row.model}</td>
                <td>{row.task}</td>
                <td className={row.status !== "ok" ? "error" : undefined}>{row.status}</td>
                <td className={row.error ? "error" : "muted"} title={row.error || undefined}>
                  {row.error || "—"}
                </td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
