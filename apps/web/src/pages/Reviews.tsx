import { useCallback, useEffect, useRef, useState } from "react";
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

type AttachmentMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
};

type Row = Review & {
  artifact?: Artifact;
  attachments: AttachmentMeta[];
  comment: string;
  expanded: boolean;
  detailHeight: number;
};

function attachmentOpenUrl(url: string): string {
  if (/^https?:\/\//i.test(url) && !url.includes("/attachments/")) {
    return url;
  }
  const token = getToken();
  const path = url.startsWith("/api") ? url : `/api${url.startsWith("/") ? url : `/${url}`}`;
  if (!token) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export function ReviewsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const resizeRef = useRef<{ key: string; startY: number; startH: number } | null>(null);

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
        let attachments: AttachmentMeta[] = [];
        try {
          artifact = await apiGet<Artifact>(`/artifacts/${review.artifactKey}`);
        } catch {
          artifact = undefined;
        }
        try {
          const att = await apiGet<{ attachments: AttachmentMeta[] }>(
            `/artifacts/${review.artifactKey}/attachments`,
          );
          attachments = att.attachments ?? [];
        } catch {
          attachments = [];
        }
        enriched.push({ ...review, artifact, attachments, comment: "", expanded: true, detailHeight: 220 });
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

  useEffect(() => {
    function onMove(event: PointerEvent): void {
      const active = resizeRef.current;
      if (!active) {
        return;
      }
      const delta = event.clientY - active.startY;
      const next = Math.max(120, Math.min(800, active.startH + delta));
      setRows((prev) =>
        prev.map((row) => (row.artifactKey === active.key ? { ...row, detailHeight: next, expanded: true } : row)),
      );
    }
    function onUp(): void {
      resizeRef.current = null;
      document.body.classList.remove("is-resizing");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

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
        Accept, reject, or request changes on artifacts in review. Expand items with the arrow or drag the bottom handle
        to see full details. Design uploads appear as links (open in a new window). Create stories in{" "}
        <Link to="/workspace">Workspace</Link>, then submit for review.
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
            No reviews yet. In Workspace: create stories → Save → <strong>Submit for approval</strong>.
          </p>
        </div>
      ) : (
        visible.map((row) => {
          const state = row.artifact?.currentVersion.workflowState ?? "—";
          const inReview = state === "IN_REVIEW";
          const needsRevise = state === "REJECTED" || state === "CHANGES_REQUESTED";
          const busy = busyKey === row.artifactKey;
          return (
            <div key={row.artifactKey} className="panel review-item" style={{ marginBottom: "1rem" }}>
              <div className="review-item-head">
                <button
                  type="button"
                  className="workspace-pane-toggle"
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((item) =>
                        item.artifactKey === row.artifactKey ? { ...item, expanded: !item.expanded } : item,
                      ),
                    )
                  }
                >
                  <span aria-hidden>{row.expanded ? "▾" : "▸"}</span>
                  <strong>
                    {row.artifactKey}
                    {row.artifact ? ` · ${row.artifact.type}` : ""}
                  </strong>
                </button>
                <span className="muted">
                  review {row.status} · workflow {state}
                  {row.artifact ? ` · v${row.artifact.currentVersion.version}` : ""}
                </span>
              </div>
              <h3>{row.artifact?.currentVersion.title ?? row.artifactKey}</h3>
              {row.expanded ? (
                <>
                  {row.artifact ? (
                    <pre className="review-detail" style={{ height: row.detailHeight }}>
                      {row.artifact.currentVersion.content}
                    </pre>
                  ) : null}
                  <div
                    className="workspace-resize-handle"
                    role="separator"
                    aria-orientation="horizontal"
                    title="Drag to expand details"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      resizeRef.current = {
                        key: row.artifactKey,
                        startY: event.clientY,
                        startH: row.detailHeight,
                      };
                      document.body.classList.add("is-resizing");
                    }}
                  />
                  {row.attachments.length > 0 ? (
                    <div className="review-attachments">
                      <span className="muted">Attachments:</span>
                      <ul>
                        {row.attachments.map((att) => (
                          <li key={att.id}>
                            <a href={attachmentOpenUrl(att.url)} target="_blank" rel="noopener noreferrer">
                              {att.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
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
                </>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
