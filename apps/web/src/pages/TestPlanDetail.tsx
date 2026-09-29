import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";

type Item = {
  key: string;
  title: string;
  workflowState: string;
  lane: string;
  automation: string;
  scriptPath: string | null;
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
  available: Array<{ key: string; title: string; workflowState: string }>;
  scripts: string[];
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
  const [adding, setAdding] = useState("");
  const [pick, setPick] = useState("");
  const [editingKey, setEditingKey] = useState("");
  const [scriptPick, setScriptPick] = useState("");

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

  async function addTest(lane: string): Promise<void> {
    if (!plan || !pick) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPost<Plan>(`/test-plans/${plan.id}/items`, { key: pick, lane });
      setPlan(next);
      setAdding("");
      setPick("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function automateTest(key: string): Promise<void> {
    if (!plan) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPost<Plan>(`/test-plans/${plan.id}/items/${encodeURIComponent(key)}/automate`, {});
      setPlan(next);
      setEditingKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveScript(key: string, scriptPath: string): Promise<void> {
    if (!plan) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPatch<Plan>(`/test-plans/${plan.id}/items/${encodeURIComponent(key)}/automation`, { scriptPath });
      setPlan(next);
      setEditingKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runScript(scriptPath: string): Promise<void> {
    if (!plan) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiPost<Plan>(`/test-plans/${plan.id}/automation/run`, { scriptPath });
      setPlan(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTest(key: string): Promise<void> {
    if (!plan) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apiDelete<Plan>(`/test-plans/${plan.id}/items/${encodeURIComponent(key)}`);
      setPlan(next);
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
          {plan.kind === "MASTER" ? null : (
            <div>
              <dt>Code changes</dt>
              <dd>{plan.codeChangeCount}</dd>
            </div>
          )}
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
          <p className="muted">This is the product test plan. It stays current as stories and tests change. Rebaseline refreshes it.</p>
        ) : plan.status === "RELEASED" ? (
          <p className="muted">Released plans keep their name, window, and tests. Run results still update.</p>
        ) : null}
      </section>

      {LANES.map((lane) => {
        const rows = plan.items.filter((item) => item.lane === lane.id);
        const editable = plan.status === "ACTIVE";
        return (
          <section key={lane.id} className="panel">
            <div className="plan-lane-head">
              <h2>
                {lane.title} <span className="muted">({rows.length})</span>
              </h2>
              {editable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAdding(adding === lane.id ? "" : lane.id);
                    setPick("");
                  }}
                >
                  Add
                </button>
              ) : null}
            </div>
            {adding === lane.id ? (
              <div className="plan-add">
                <select value={pick} onChange={(event) => setPick(event.target.value)}>
                  <option value="">Choose a test</option>
                  {(plan.available ?? []).map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.key} — {row.title}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy || !pick} onClick={() => void addTest(lane.id)}>
                  Add to section
                </button>
              </div>
            ) : null}
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
                    {editable ? <th></th> : null}
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
                      <td>
                        <div>{row.automation}</div>
                        {row.scriptPath ? <div className="muted">{row.scriptPath}</div> : null}
                        {plan.kind === "MASTER" && editingKey === row.key ? (
                          <div className="plan-add">
                            <select value={scriptPick} onChange={(event) => setScriptPick(event.target.value)}>
                              <option value="">Choose a script</option>
                              {(plan.scripts ?? []).map((script) => (
                                <option key={script} value={script}>
                                  {script}
                                </option>
                              ))}
                            </select>
                            <button type="button" disabled={busy || !scriptPick} onClick={() => void saveScript(row.key, scriptPick)}>
                              Save
                            </button>
                            <button type="button" disabled={busy} onClick={() => void saveScript(row.key, "")}>
                              Clear
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {runLabel(row.runStatus)}
                        {row.runFinishedAt ? <span className="muted"> · {new Date(row.runFinishedAt).toLocaleString()}</span> : null}
                      </td>
                      {editable ? (
                        <td className="plan-row-actions">
                          {plan.kind === "MASTER" ? (
                            row.scriptPath ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditingKey(editingKey === row.key ? "" : row.key);
                                    setScriptPick(row.scriptPath ?? "");
                                  }}
                                >
                                  Edit
                                </button>
                                <button type="button" disabled={busy} onClick={() => void runScript(row.scriptPath!)}>
                                  Run
                                </button>
                              </>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => void automateTest(row.key)}>
                                Automate
                              </button>
                            )
                          ) : null}
                          <button type="button" disabled={busy} onClick={() => void removeTest(row.key)}>
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {plan.kind === "MASTER" ? null : (
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
      )}

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
