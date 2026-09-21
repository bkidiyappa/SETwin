import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, getToken, onTokenChange } from "../api";

type Approval = {
  artifactKey: string;
  requiredRole: string;
  status: string;
  dueAt?: string | null;
};

type Artifact = {
  key: string;
  type: string;
  currentVersion: { version: number; title: string; content: string; workflowState: string };
};

type Row = Approval & { artifact?: Artifact; comment: string };

export function ApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);

  const load = useCallback(async () => {
    if (!getToken()) {
      setRows([]);
      setError("Sign in on the Dashboard first.");
      return;
    }
    setError("");
    try {
      const payload = await apiGet<{ approvals: Approval[] }>("/approvals");
      const approvals = payload.approvals ?? [];
      const enriched: Row[] = [];
      for (const approval of approvals) {
        let artifact: Artifact | undefined;
        try {
          artifact = await apiGet<Artifact>(`/artifacts/${approval.artifactKey}`);
        } catch {
          artifact = undefined;
        }
        enriched.push({ ...approval, artifact, comment: "" });
      }
      setRows(enriched);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    return onTokenChange(() => {
      void load();
    });
  }, [load]);

  async function decide(row: Row, decision: "APPROVE" | "REJECT" | "CHANGES_REQUESTED"): Promise<void> {
    if (decision !== "APPROVE" && !row.comment.trim()) {
      setError("Enter a reason for reject / request changes.");
      return;
    }
    setBusyKey(`${row.artifactKey}:${row.requiredRole}`);
    setError("");
    try {
      await apiPost(`/artifacts/${row.artifactKey}/review/decide`, {
        decision,
        comment: row.comment.trim() || "Approved from Approvals inbox",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey("");
    }
  }

  const visible = rows.filter((row) => {
    if (!onlyPending) {
      return true;
    }
    return row.status === "PENDING" || row.status === "BLOCKED";
  });

  return (
    <div>
      <h1>Approvals</h1>
      <p>
        Your approval inbox. Stories must be submitted first in <Link to="/workspace">Workspace</Link> (or appear
        under <Link to="/reviews">Reviews</Link>).
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar">
        <label className="muted" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(event) => setOnlyPending(event.target.checked)}
          />
          Pending only
        </label>
        <button type="button" onClick={() => void load()} disabled={Boolean(busyKey)}>
          Refresh
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="panel">
          <p className="muted">
            No pending approvals. After you <strong>Submit for review</strong> on a story, a pending request for the
            policy role (e.g. product_owner) shows here.
          </p>
        </div>
      ) : (
        visible.map((row, index) => {
          const state = row.artifact?.currentVersion.workflowState ?? "—";
          const canDecide = row.status === "PENDING" && state === "IN_REVIEW";
          const key = `${row.artifactKey}-${row.requiredRole}-${index}`;
          const busy = busyKey === `${row.artifactKey}:${row.requiredRole}`;
          return (
            <div key={key} className="panel" style={{ marginBottom: "1rem" }}>
              <div className="workspace-card-meta">
                <strong>
                  {row.artifactKey}
                  {row.artifact ? ` · ${row.artifact.type}` : ""}
                </strong>
                <span className="muted">
                  {row.requiredRole}:{row.status} · workflow {state}
                  {row.dueAt ? ` · due ${row.dueAt}` : ""}
                </span>
              </div>
              <h3>{row.artifact?.currentVersion.title ?? row.artifactKey}</h3>
              {row.artifact ? (
                <pre style={{ maxHeight: "8rem", overflow: "auto" }}>{row.artifact.currentVersion.content}</pre>
              ) : null}
              {canDecide ? (
                <>
                  <textarea
                    className="workspace-prompt"
                    style={{ minHeight: "3.5rem", width: "100%", marginTop: "0.5rem" }}
                    value={row.comment}
                    disabled={busy}
                    placeholder="Comment / rejection reason…"
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, comment: event.target.value } : item)),
                      )
                    }
                  />
                  <div className="toolbar workspace-actions">
                    <button type="button" disabled={busy} onClick={() => void decide(row, "APPROVE")}>
                      Accept
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide(row, "REJECT")}>
                      Reject
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide(row, "CHANGES_REQUESTED")}>
                      Request changes
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  {row.status === "BLOCKED"
                    ? "Blocked until earlier sequential approvers finish."
                    : `No action (${row.status}).`}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
