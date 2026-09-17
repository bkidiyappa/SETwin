import { useEffect, useState } from "react";
import { apiGet } from "../api";

type Artifact = {
  key: string;
  type: string;
  projectKey: string;
  currentVersion: { version: number; title: string; workflowState: string };
};

export function TwinExplorerPage() {
  const [rows, setRows] = useState<Artifact[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Artifact[]>("/artifacts")
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Twin Explorer</h1>
      <p>Browse artifacts and workflow state.</p>
      {error ? <p className="error">{error}</p> : null}
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
      </div>
    </div>
  );
}
