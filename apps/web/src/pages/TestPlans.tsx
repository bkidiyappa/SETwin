import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api";

type Project = { key: string; name: string };
type Totals = { total: number; passed: number; failed: number; skipped: number; notRun: number };
type PlanRow = {
  id: string;
  name: string;
  projectKey: string;
  projectName: string;
  since: string;
  status: "ACTIVE" | "RELEASED";
  updatedAt: string;
  kind: "MASTER" | "WINDOW";
  totals: Totals;
};

export function TestPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [includeReleased, setIncludeReleased] = useState(false);
  const [project, setProject] = useState("");
  const [since, setSince] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiGet<Project[]>("/projects")
      .then((rows) => {
        if (!cancelled) {
          setProjects(rows);
          setProject((current) => current || rows[0]?.key || "");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiGet<PlanRow[]>(`/test-plans${includeReleased ? "?includeReleased=1" : ""}`)
      .then((rows) => {
        if (!cancelled) {
          setPlans(rows);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [includeReleased]);

  async function createPlan(): Promise<void> {
    if (!project || !since) {
      setError("Choose a product and a since time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await apiPost<{ id: string }>(`/projects/${project}/test-plans`, {
        since: new Date(since).toISOString(),
      });
      navigate(`/test-plans/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const masters = plans.filter((row) => row.kind === "MASTER");
  const others = plans.filter((row) => row.kind !== "MASTER");

  return (
    <div className="page">
      <h1>Test Plans</h1>
      <p className="muted">Each product has a master test plan. Other plans cover code changed since a chosen time.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="panel toolbar">
        <label>
          Product
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            {projects.map((row) => (
              <option key={row.key} value={row.key}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Since
          <input type="datetime-local" value={since} onChange={(event) => setSince(event.target.value)} />
        </label>
        <button type="button" disabled={busy} onClick={() => void createPlan()}>
          Create plan
        </button>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeReleased}
            onChange={(event) => setIncludeReleased(event.target.checked)}
          />
          Include released
        </label>
      </div>
      <h2>Master Test Plan</h2>
      <PlanTable
        rows={masters}
        empty="Create a product in Setup to start its master test plan."
        showSince={false}
        onOpen={(id) => navigate(`/test-plans/${id}`)}
      />
      <h2>Other test plans</h2>
      <PlanTable
        rows={others}
        empty={`No ${includeReleased ? "" : "active "}test plans yet.`}
        showSince
        onOpen={(id) => navigate(`/test-plans/${id}`)}
      />
    </div>
  );
}

function PlanTable({
  rows,
  empty,
  showSince,
  onOpen,
}: {
  rows: PlanRow[];
  empty: string;
  showSince: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Product</th>
          {showSince ? <th>Since</th> : <th>Last updated</th>}
          <th>Status</th>
          <th>Total</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Skipped</th>
          <th>Not run</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="muted">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="click-row" onClick={() => onOpen(row.id)}>
              <td>{row.name}</td>
              <td>{row.projectName || row.projectKey}</td>
              <td>{showSince ? new Date(row.since).toLocaleString() : new Date(row.updatedAt).toLocaleString()}</td>
              <td>{row.kind === "MASTER" ? "Master" : row.status === "RELEASED" ? "Released" : "Active"}</td>
              <td>{row.totals.total}</td>
              <td>{row.totals.passed}</td>
              <td>{row.totals.failed}</td>
              <td>{row.totals.skipped}</td>
              <td>{row.totals.notRun}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
