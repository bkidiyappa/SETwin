import { useEffect, useState } from "react";
import { apiGet } from "../api";

type AuditEvent = {
  sequence: number;
  action: string;
  actorUsername: string;
  entityKey: string;
  eventHash: string;
  createdAt: string;
};

export function AuditPage() {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<AuditEvent[]>("/audit")
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Audit</h1>
      <p>Append-only, hash-chained engineering history.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sequence}>
                <td>{row.sequence}</td>
                <td>{row.action}</td>
                <td>{row.actorUsername || "—"}</td>
                <td>{row.entityKey}</td>
                <td className="muted">{row.eventHash.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
