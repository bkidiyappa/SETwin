import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, getToken, onTokenChange } from "../api";

type ReviewRequest = { requiredRole: string; status: string };
type ReviewFinding = { summary?: string; severity?: string };

type Review = {
  artifactKey: string;
  status: string;
  findings: ReviewFinding[];
  requests: ReviewRequest[];
};

type Artifact = {
  key: string;
  type: string;
  currentVersion: { version: number; title: string; content: string; workflowState: string };
};

type Row = Review & { artifact?: Artifact; comment: string };

export function ReviewsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    if (!getToken()) {
      setRows([]);
      setError("Sign in on the Dashboard first.");
      return;
    }
    setError("");
    try {
      const payload = await apiGet<{ reviews: Review[] }>("/reviews");
      const reviews = payload.reviews ?? [];
      const enriched: Row[] = [];
      for (const review of reviews) {
        let artifact: Artifact | undefined;
        try {
          artifact = await apiGet<Artifact>(`/artifacts/${review.artifactKey}`);
        } catch {
          artifact = undefined;
        }
        enriched.push({ ...review, artifact, comment: "" });
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
    setBusyKey(row.artifactKey);
    setError("");
    try {
      await apiPost(`/artifacts/${row.artifactKey}/review/decide`, {
        decision,
        comment: row.comment.trim() || "Approved from Reviews page",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey("");
    }
  }

  async function revise(row: Row, resubmit: boolean): Promise<void> {
    if (!row.comment.trim()) {
      setError("Enter the rejection / change reason for the agent to address.");
      return;
    }
    setBusyKey(row.artifactKey);
    setError("");
    try {
      await apiPost(`/artifacts/${row.artifactKey}/revise-from-rejection`, {
        reason: row.comment.trim(),
        resubmit,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey("");
    }
  }

  const visible = rows.filter((row) => {
    if (filter === "all") {
      return true;
    }
    const state = row.artifact?.currentVersion.workflowState;
    return row.status === "OPEN" || state === "IN_REVIEW" || state === "REJECTED" || state === "CHANGES_REQUESTED";
  });

  return (
    <div>
      <h1>Reviews</h1>
      <p>
        Accept, reject, or request changes on artifacts in review. Create stories in{" "}
        <Link to="/workspace">Workspace</Link>, click <strong>Submit for review</strong>, then decide here (or on the
        story card).
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar">
        <select value={filter} onChange={(event) => setFilter(event.target.value as "open" | "all")}>
          <option value="open">Open / needs action</option>
          <option value="all">All reviews</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={Boolean(busyKey)}>
          Refresh
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="panel">
          <p className="muted">
            No reviews yet. In Workspace: create stories → Save → <strong>Submit for review</strong>. That opens a
            review and shows Accept / Reject here.
          </p>
        </div>
      ) : (
        visible.map((row) => {
          const state = row.artifact?.currentVersion.workflowState ?? "—";
          const inReview = state === "IN_REVIEW";
          const needsRevise = state === "REJECTED" || state === "CHANGES_REQUESTED";
          const busy = busyKey === row.artifactKey;
          return (
            <div key={row.artifactKey} className="panel" style={{ marginBottom: "1rem" }}>
              <div className="workspace-card-meta">
                <strong>
                  {row.artifactKey}
                  {row.artifact ? ` · ${row.artifact.type}` : ""}
                </strong>
                <span className="muted">
                  review {row.status} · workflow {state}
                  {row.artifact ? ` · v${row.artifact.currentVersion.version}` : ""}
                </span>
              </div>
              <h3>{row.artifact?.currentVersion.title ?? row.artifactKey}</h3>
              {row.artifact ? (
                <pre style={{ maxHeight: "10rem", overflow: "auto" }}>{row.artifact.currentVersion.content}</pre>
              ) : null}
              <p className="muted" style={{ marginTop: "0.5rem" }}>
                Requests:{" "}
                {row.requests?.map((request) => `${request.requiredRole}:${request.status}`).join(", ") || "—"}
                {" · "}
                Findings: {row.findings?.length ?? 0}
              </p>
              <textarea
                className="workspace-prompt"
                style={{ minHeight: "3.5rem", width: "100%" }}
                value={row.comment}
                disabled={busy}
                placeholder="Comment / rejection reason…"
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.artifactKey === row.artifactKey ? { ...item, comment: event.target.value } : item,
                    ),
                  )
                }
              />
              <div className="toolbar workspace-actions">
                {inReview ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void decide(row, "APPROVE")}>
                      Accept
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide(row, "REJECT")}>
                      Reject
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide(row, "CHANGES_REQUESTED")}>
                      Request changes
                    </button>
                  </>
                ) : null}
                {needsRevise ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void revise(row, false)}>
                      Agent revise
                    </button>
                    <button type="button" disabled={busy} onClick={() => void revise(row, true)}>
                      Agent revise + resubmit
                    </button>
                  </>
                ) : null}
                {!inReview && !needsRevise ? (
                  <span className="muted">No actions for this state — submit a DRAFT from Workspace first.</span>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
