import { useEffect, useState } from "react";
import { apiGet } from "../api";

type Approval = {
  artifactKey: string;
  requiredRole: string;
  status: string;
  dueAt?: string | null;
};

export function ApprovalsPage() {
  const [rows, setRows] = useState<Approval[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<{ approvals: Approval[] }>("/approvals")
      .then((payload) => setRows(payload.approvals ?? []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Approvals</h1>
      <p>Pending and completed approval requests.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Artifact</th>
              <th>Role</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.artifactKey}-${row.requiredRole}-${index}`}>
                <td>{row.artifactKey}</td>
                <td>{row.requiredRole}</td>
                <td>{row.status}</td>
                <td>{row.dueAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
