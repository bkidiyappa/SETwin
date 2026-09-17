import { useEffect, useState } from "react";
import { apiGet } from "../api";

type Review = {
  artifactKey: string;
  status: string;
  findings: unknown[];
  requests: Array<{ requiredRole: string; status: string }>;
};

export function ReviewsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<{ reviews: Review[] }>("/reviews")
      .then((payload) => setRows(payload.reviews ?? []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Reviews</h1>
      <p>Open and completed reviews across the twin.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Artifact</th>
              <th>Status</th>
              <th>Findings</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.artifactKey}>
                <td>{row.artifactKey}</td>
                <td>{row.status}</td>
                <td>{row.findings?.length ?? 0}</td>
                <td>{row.requests?.map((request) => `${request.requiredRole}:${request.status}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
