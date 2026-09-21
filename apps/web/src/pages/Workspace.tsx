import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiGet,
  apiPost,
  getSessionUser,
  getToken,
  hasPermission,
  hasRole,
  onTokenChange,
  refreshSession,
  type SessionUser,
} from "../api";

type Project = { key: string; name: string };

type ArtifactCard = {
  key: string;
  type: string;
  projectKey?: string;
  currentVersion: { version: number; title: string; content: string; workflowState: string; status?: string };
  checks?: { ambiguities: string[]; businessRules: string[]; conflicts: string[] };
  aiStatus?: string;
  aiError?: string;
  draftTitle?: string;
  draftContent?: string;
  decisionReason?: string;
};

type LogEntry = {
  id: string;
  at: string;
  level: "info" | "ok" | "warn" | "error";
  message: string;
};

type AuditEvent = {
  sequence: number;
  action: string;
  actorUsername: string;
  entityKey: string;
  createdAt: string;
};

function toCard(row: ArtifactCard): ArtifactCard {
  return {
    ...row,
    draftTitle: row.draftTitle ?? row.currentVersion.title,
    draftContent: row.draftContent ?? row.currentVersion.content,
    decisionReason: row.decisionReason ?? "",
  };
}

export function WorkspacePage() {
  const [session, setSession] = useState<SessionUser | null>(getSessionUser());
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [prompt, setPrompt] = useState("");
  const [stories, setStories] = useState<ArtifactCard[]>([]);
  const [followOns, setFollowOns] = useState<ArtifactCard[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const pushLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ]);
  }, []);

  const loadProjects = useCallback(async () => {
    if (!getToken()) {
      setError("Sign in on the Dashboard first.");
      return;
    }
    setError("");
    try {
      const rows = await apiGet<Project[]>("/projects");
      setProjects(rows);
      setProject((current) => (rows.some((row) => row.key === current) ? current : rows[0]?.key ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshAudit = useCallback(async () => {
    if (!getToken()) {
      return;
    }
    try {
      const events = await apiGet<AuditEvent[]>("/audit?limit=40");
      const mapped: LogEntry[] = events
        .slice()
        .reverse()
        .map((event) => ({
          id: `audit-${event.sequence}`,
          at: new Date(event.createdAt).toLocaleTimeString(),
          level: "ok" as const,
          message: `#${event.sequence} ${event.action} ${event.entityKey || ""} (${event.actorUsername || "system"})`,
        }));
      setLogs((session) => {
        const sessionOnly = session.filter((row) => !row.id.startsWith("audit-"));
        return [...mapped, ...sessionOnly].slice(-200);
      });
    } catch {
      // session logs still show
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (getToken()) {
        try {
          setSession(await refreshSession());
        } catch {
          setSession(getSessionUser());
        }
      }
      await loadProjects();
      await refreshAudit();
    })();
    return onTokenChange(() => {
      setSession(getSessionUser());
      void loadProjects();
      void refreshAudit();
    });
  }, [loadProjects, refreshAudit]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function patchStory(key: string, patch: Partial<ArtifactCard>): void {
    setStories((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function patchFollowOn(key: string, patch: Partial<ArtifactCard>): void {
    setFollowOns((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function upsertList(
    setter: typeof setStories,
    rows: ArtifactCard[],
  ): void {
    setter((prev) => {
      const next = [...rows.map(toCard)];
      for (const row of prev) {
        if (!next.some((item) => item.key === row.key)) {
          next.push(row);
        }
      }
      return next;
    });
  }

  async function runPrompt(): Promise<void> {
    if (!getToken()) {
      setError("Sign in on the Dashboard first.");
      return;
    }
    if (!project) {
      setError("Create a SETwin project first.");
      return;
    }
    const text = prompt.trim();
    if (!text) {
      setError("Enter a prompt.");
      return;
    }

    setBusy(true);
    setError("");
    pushLog(`PO skill prompt_to_stories for project ${project}`, "info");
    try {
      const batch = await apiPost<{
        stories: ArtifactCard[];
        aiStatus: string;
        aiError?: string;
      }>("/stories/from-prompt", { project, prompt: text });
      upsertList(setStories, batch.stories);
      pushLog(`${batch.stories.length} story DRAFT(s) created (ai=${batch.aiStatus})`, "ok");
      for (const story of batch.stories) {
        pushLog(`${story.key}: ${story.currentVersion.title}`, "ok");
      }
      if (batch.aiError) {
        pushLog(`AI note: ${batch.aiError}`, "warn");
      }
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCard(row: ArtifactCard, target: "story" | "follow"): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const updated = await apiPost<ArtifactCard>(
        target === "story" ? `/stories/${row.key}` : `/artifacts/${row.key}/save`,
        {
          title: row.draftTitle,
          content: row.draftContent,
        },
      );
      const card = toCard(updated);
      if (target === "story") {
        setStories((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      } else {
        setFollowOns((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      }
      pushLog(`Saved ${updated.key} v${updated.currentVersion.version}`, "ok");
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitCard(key: string, target: "story" | "follow"): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const updated = await apiPost<ArtifactCard>(`/artifacts/${key}/submit`, {
        comment: "Submitted from Workspace",
      });
      const card = toCard(updated);
      if (target === "story") {
        setStories((prev) => prev.map((item) => (item.key === key ? card : item)));
      } else {
        setFollowOns((prev) => prev.map((item) => (item.key === key ? card : item)));
      }
      pushLog(`${key} submitted → ${updated.currentVersion.workflowState}`, "ok");
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function decideCard(
    row: ArtifactCard,
    decision: "APPROVE" | "REJECT" | "CHANGES_REQUESTED",
    target: "story" | "follow",
  ): Promise<void> {
    const reason = (row.decisionReason ?? "").trim();
    if (decision !== "APPROVE" && !reason) {
      setError("Enter a reason for reject / request changes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost(`/artifacts/${row.key}/review/decide`, {
        decision,
        comment: reason || "Approved from Workspace",
      });
      const updated = await apiGet<ArtifactCard>(`/artifacts/${row.key}`);
      const card = toCard({ ...updated, decisionReason: reason });
      if (target === "story") {
        setStories((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      } else {
        setFollowOns((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      }
      pushLog(`${row.key} decision ${decision}${reason ? `: ${reason}` : ""}`, "ok");
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function reviseFromRejection(
    row: ArtifactCard,
    target: "story" | "follow",
    resubmit: boolean,
  ): Promise<void> {
    const reason = (row.decisionReason ?? "").trim();
    if (!reason) {
      setError("Enter the rejection / change reason for the agent to address.");
      return;
    }
    setBusy(true);
    setError("");
    pushLog(`Role agent revising ${row.key} from rejection…`, "info");
    try {
      const updated = await apiPost<ArtifactCard & { aiStatus: string; aiError?: string; resubmitted: boolean }>(
        `/artifacts/${row.key}/revise-from-rejection`,
        { reason, resubmit },
      );
      const card = toCard({ ...updated, decisionReason: "" });
      if (target === "story") {
        setStories((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      } else {
        setFollowOns((prev) => prev.map((item) => (item.key === row.key ? card : item)));
      }
      pushLog(
        `${row.key} revised v${updated.currentVersion.version} (ai=${updated.aiStatus}, resubmit=${updated.resubmitted})`,
        "ok",
      );
      if (updated.aiError) {
        pushLog(`AI note: ${updated.aiError}`, "warn");
      }
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function advanceStage(targetStage: "design" | "code" | "test"): Promise<void> {
    const approvedStories = stories.filter((row) => row.currentVersion.workflowState === "APPROVED");
    if (targetStage === "design" && !approvedStories.length) {
      setError("Approve at least one story before advancing to Design.");
      return;
    }
    if (targetStage === "design" && !(hasRole("architect", session) || hasPermission("design:create", session))) {
      setError("Architect role (or design:create) required to create design artifacts.");
      return;
    }
    if (targetStage === "code" && !(hasRole("developer", session) || hasPermission("artifact:create", session))) {
      setError("Developer role required to create code artifacts.");
      return;
    }
    if (targetStage === "test" && !(hasRole("qa_reviewer", session) || hasPermission("test:create", session))) {
      setError("QA role required to create test artifacts.");
      return;
    }
    setBusy(true);
    setError("");
    pushLog(`Advancing pipeline → ${targetStage} (reuse existing links when present)…`, "info");
    try {
      const result = await apiPost<{
        blockedReason?: string;
        created: ArtifactCard[];
        reused: ArtifactCard[];
        links: Array<{ from: string; to: string; type: string }>;
      }>("/pipeline/advance", {
        project,
        targetStage,
        sourceKeys: targetStage === "design" ? approvedStories.map((row) => row.key) : undefined,
        reuseExisting: true,
      });
      if (result.blockedReason) {
        setError(result.blockedReason);
        pushLog(result.blockedReason, "warn");
      }
      upsertList(setFollowOns, [...result.created, ...result.reused]);
      for (const row of result.reused) {
        pushLog(`Reused ${row.key} ${row.type} (relation established)`, "ok");
      }
      for (const row of result.created) {
        pushLog(`${row.key} ${row.type} DRAFT created`, "ok");
      }
      for (const link of result.links ?? []) {
        pushLog(`Link ${link.from} -[${link.type}]-> ${link.to}`, "ok");
      }
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderArtifactCard(row: ArtifactCard, target: "story" | "follow") {
    const state = row.currentVersion.workflowState;
    const editable = state === "DRAFT" || state === "REJECTED" || state === "CHANGES_REQUESTED";
    const patch = target === "story" ? patchStory : patchFollowOn;

    return (
      <article key={`${row.key}-v${row.currentVersion.version}-${state}`} className="workspace-card">
        <div className="workspace-card-meta">
          <strong>
            {row.key} · {row.type}
          </strong>
          <span className="muted">
            v{row.currentVersion.version} · {state}
          </span>
        </div>
        <input
          className="workspace-title-input"
          value={row.draftTitle ?? ""}
          disabled={busy || !editable}
          onChange={(event) => patch(row.key, { draftTitle: event.target.value })}
        />
        <textarea
          className="workspace-prompt"
          style={{ minHeight: "7rem" }}
          value={row.draftContent ?? ""}
          disabled={busy || !editable}
          onChange={(event) => patch(row.key, { draftContent: event.target.value })}
        />
        {row.checks ? (
          <ul className="muted">
            <li>Ambiguities: {row.checks.ambiguities.length}</li>
            <li>Business-rule cues: {row.checks.businessRules.length}</li>
            <li>Conflicts: {row.checks.conflicts.length}</li>
          </ul>
        ) : null}
        <div className="toolbar workspace-actions">
          {editable ? (
            <button type="button" disabled={busy} onClick={() => void saveCard(row, target)}>
              Save edit
            </button>
          ) : null}
          {state === "DRAFT" ? (
            <button type="button" disabled={busy} onClick={() => void submitCard(row.key, target)}>
              Submit for review
            </button>
          ) : null}
          {state === "IN_REVIEW" ? (
            <>
              <button
                type="button"
                disabled={busy || !hasPermission("artifact:approve", session)}
                title={!hasPermission("artifact:approve", session) ? "Missing artifact:approve" : undefined}
                onClick={() => void decideCard(row, "APPROVE", target)}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy || !hasPermission("artifact:reject", session)}
                onClick={() => void decideCard(row, "REJECT", target)}
              >
                Reject
              </button>
              <button
                type="button"
                disabled={busy || !hasPermission("artifact:request_changes", session)}
                onClick={() => void decideCard(row, "CHANGES_REQUESTED", target)}
              >
                Request changes
              </button>
            </>
          ) : null}
          {state === "REJECTED" || state === "CHANGES_REQUESTED" || state === "DRAFT" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void reviseFromRejection(row, target, false)}>
                Agent revise
              </button>
              <button type="button" disabled={busy} onClick={() => void reviseFromRejection(row, target, true)}>
                Agent revise + resubmit
              </button>
            </>
          ) : null}
        </div>
        {(state === "IN_REVIEW" || state === "REJECTED" || state === "CHANGES_REQUESTED") && (
          <textarea
            className="workspace-prompt"
            style={{ minHeight: "3.5rem", marginTop: "0.5rem" }}
            value={row.decisionReason ?? ""}
            disabled={busy}
            onChange={(event) => patch(row.key, { decisionReason: event.target.value })}
            placeholder="Rejection / change reason (required for reject; used by agent revise)…"
          />
        )}
      </article>
    );
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div>
          <h1>Workspace</h1>
          <p>Prompt → editable stories → Submit → Reviews/Approvals → architecture / code / tests</p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? <option value="">No project</option> : null}
            {projects.map((row) => (
              <option key={row.key} value={row.key}>
                {row.key} — {row.name}
              </option>
            ))}
          </select>
          {!getToken() ? (
            <Link to="/" className="error">
              Sign in required
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="workspace-grid">
        <section className="workspace-pane">
          <div className="workspace-pane-title">Prompt (PO → stories)</div>
          <textarea
            className="workspace-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Enter a product prompt — e.g. customers can cancel an unpaid order within 30 minutes…"
            disabled={busy}
          />
          <div className="toolbar" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            <button type="button" disabled={busy || !prompt.trim() || !project} onClick={() => void runPrompt()}>
              {busy ? "Working…" : "Create stories"}
            </button>
            <button
              type="button"
              disabled={busy || !stories.some((row) => row.currentVersion.workflowState === "APPROVED")}
              onClick={() => void advanceStage("design")}
            >
              Advance → Design
            </button>
            <button type="button" disabled={busy} onClick={() => void advanceStage("code")}>
              Advance → Code
            </button>
            <button type="button" disabled={busy} onClick={() => void advanceStage("test")}>
              Advance → Tests
            </button>
            <Link to="/twin" className="muted">
              Open Twin Explorer
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStories([]);
                setFollowOns([]);
                setLogs([]);
                setError("");
                pushLog("Workspace panes cleared (database unchanged)", "info");
              }}
            >
              Clear panes
            </button>
          </div>
        </section>

        <section className="workspace-pane">
          <div className="workspace-pane-title">
            Stories (edit → Submit →{" "}
            <Link to="/reviews" style={{ color: "inherit" }}>
              Reviews
            </Link>
            /
            <Link to="/approvals" style={{ color: "inherit" }}>
              Approvals
            </Link>
            )
          </div>
          <div className="workspace-scroll">
            {stories.length === 0 ? (
              <p className="muted">
                One prompt can create multiple STORY drafts. Edit, click <strong>Submit for review</strong>, then
                Accept/Reject here or on the Reviews / Approvals pages.
              </p>
            ) : (
              stories.map((row) => renderArtifactCard(row, "story"))
            )}
          </div>
        </section>

        <section className="workspace-pane">
          <div className="workspace-pane-title">Architecture / Code / Tests</div>
          <div className="workspace-scroll">
            {followOns.length === 0 ? (
              <p className="muted">
                Generate follow-on drafts from stories. Same edit → submit → accept/reject → agent revise loop.
              </p>
            ) : (
              followOns.map((row) => renderArtifactCard(row, "follow"))
            )}
          </div>
        </section>

        <section className="workspace-pane workspace-log-pane">
          <div className="workspace-pane-title">Activity log</div>
          <div className="workspace-scroll workspace-log">
            {logs.length === 0 ? (
              <p className="muted">Session and audit events stream here.</p>
            ) : (
              logs.map((row) => (
                <div key={row.id} className={`log-line log-${row.level}`}>
                  <span className="log-time">{row.at}</span>
                  <span>{row.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
          <div className="toolbar" style={{ marginBottom: 0, marginTop: "0.5rem" }}>
            <button type="button" disabled={busy} onClick={() => void refreshAudit()}>
              Refresh audit
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
