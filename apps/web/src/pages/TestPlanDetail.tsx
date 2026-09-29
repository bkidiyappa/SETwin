import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../api";

type Item = {
  key: string;
  title: string;
  workflowState: string;
  lane: string;
  automation: string;
  runStatus: string;
  runFinishedAt: string | null;
};

type Plan = {
  id: string;
  name: string;
  projectName: string;
  projectKey: string;
  since: string;
  status: "ACTIVE" | "RELEASED";
  codeChangeCount: number;
  updatedAt: string;
  kind: "MASTER" | "WINDOW";
  totals: { total: number; passed: number; failed: number; skipped: number; notRun: number };
  code: Array<{ key: string; title: string }>;
  items: Item[];
  revisions: Array<{ id: string; summary: string; at: string; actor: string }>;
};

const LANES: Array<{ id: string; title: string }> = [
  { id: "critical_functional", title: "Critical path, functional" },
  { id: "critical_nonfunctional", title: "Critical path, non-functional" },
  { id: "regression_functional", title: "Regression, functional" },
  { id: "regression_nonfunctional", title: "Regression, non-functional" },
];

export function TestPlanDetailPage() {
  const { id = "" } = useParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiGet<Plan>(`/test-plans/${id}`)
      .then((row) => {
        if (!cancelled) {
          setPlan(row);
          setName(row.name);
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
  }, [id]);

  async function saveName(): Promise<void> {
    if (!plan || plan.status !== "ACTIVE") {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPatch<Plan>(`/test-plans/${plan.id}`, { name });
      setPlan(next);
      setName(next.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function rebaseline(): Promise<void> {
    if (!plan || plan.kind !== "MASTER") {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPost<Plan>(`/test-plans/${plan.id}/rebaseline`, {});
      setPlan(next);
      setName(next.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function release(): Promise<void> {
    if (!plan) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPost<Plan>(`/test-plans/${plan.id}/release`, {});
      setPlan(next);
      setName(next.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="page">
        <p>{error || "Loading test plan…"}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/test-plans">Test Plans</Link>
        <span aria-hidden="true">/</span>
        <span>{plan.name}</span>
      </nav>
      {error ? <p className="error">{error}</p> : null}
      <section className="panel plan-summary">
        <div className="plan-summary-name">
          {plan.kind === "MASTER" || plan.status !== "ACTIVE" ? (
            <h1>{plan.name}</h1>
          ) : (
            <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Plan name" />
          )}
          {plan.kind !== "MASTER" && plan.status === "ACTIVE" ? (
            <button type="button" disabled={busy || name.trim() === plan.name} onClick={() => void saveName()}>
              Save name
            </button>
          ) : null}
          {plan.kind === "MASTER" ? (
            <button type="button" disabled={busy} onClick={() => void rebaseline()}>
              Rebaseline
            </button>
          ) : null}
        </div>
        <div className="plan-stats-row">
        <dl className="plan-stats">
          <div>
            <dt>Status</dt>
            <dd>{plan.kind === "MASTER" ? "Master" : plan.status === "RELEASED" ? "Released" : "Active"}</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>{plan.projectName || plan.projectKey}</dd>
          </div>
          <div>
            <dt>{plan.kind === "MASTER" ? "Last updated" : "Since"}</dt>
            <dd>{plan.kind === "MASTER" ? new Date(plan.updatedAt).toLocaleString() : new Date(plan.since).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Code changes</dt>
            <dd>{plan.codeChangeCount}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{plan.totals.total}</dd>
          </div>
          <div>
            <dt>Passed</dt>
            <dd>{plan.totals.passed}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{plan.totals.failed}</dd>
          </div>
          <div>
            <dt>Skipped</dt>
            <dd>{plan.totals.skipped}</dd>
          </div>
          <div>
            <dt>Not run</dt>
            <dd>{plan.totals.notRun}</dd>
          </div>
        </dl>
        {plan.kind !== "MASTER" && plan.status === "ACTIVE" ? (
          <button type="button" className="plan-release" disabled={busy} onClick={() => void release()}>
            Release
          </button>
        ) : null}
        </div>
        {plan.kind === "MASTER" ? (
          <p className="muted">This plan follows the product. Rebaseline refreshes its tests from the current stories, code, and tests.</p>
        ) : plan.status === "RELEASED" ? (
          <p className="muted">Released plans keep their name, window, and tests. Run results still update.</p>
        ) : null}
      </section>

      {LANES.map((lane) => {
        const rows = plan.items.filter((item) => item.lane === lane.id);
        return (
          <section key={lane.id} className="panel">
            <h2>
              {lane.title} <span className="muted">({rows.length})</span>
            </h2>
            {rows.length === 0 ? (
              <p className="muted">None</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Title</th>
                    <th>State</th>
                    <th>Automation</th>
                    <th>Recent run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <code>{row.key}</code>
                      </td>
                      <td>{row.title}</td>
                      <td>{row.workflowState}</td>
                      <td>{row.automation}</td>
                      <td>
                        {runLabel(row.runStatus)}
                        {row.runFinishedAt ? <span className="muted"> · {new Date(row.runFinishedAt).toLocaleString()}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <section className="panel">
        <h2>Code in this window</h2>
        {plan.code.length === 0 ? (
          <p className="muted">No code artifacts changed in this window.</p>
        ) : (
          <ul>
            {plan.code.map((row) => (
              <li key={row.key}>
                <code>{row.key}</code> {row.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>History</h2>
        <ul className="plan-history">
          {plan.revisions.map((row) => (
            <li key={row.id}>
              <strong>{row.actor}</strong> · {new Date(row.at).toLocaleString()}
              <div>{row.summary}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function runLabel(status: string): string {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Not run";
}
