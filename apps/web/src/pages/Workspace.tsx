import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  apiDelete,
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

type FeatureOption = {
  key: string;
  currentVersion: { title: string };
};

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
  referencesText?: string;
  featureKey?: string;
};

type AttachmentMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
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

type Rel = { from: string; to: string; type: string };

const STORY_TYPES = new Set(["STORY", "REQUIREMENT", "EPIC"]);
const DESIGN_TYPES = new Set(["DESIGN", "ARCHITECTURE"]);
const CODE_TYPES = new Set(["CODE"]);
const TEST_TYPES = new Set(["TEST", "GHERKIN"]);

function toCard(row: ArtifactCard): ArtifactCard {
  return {
    ...row,
    draftTitle: row.draftTitle ?? row.currentVersion.title,
    draftContent: row.draftContent ?? row.currentVersion.content,
    decisionReason: row.decisionReason ?? "",
    referencesText: row.referencesText ?? "",
    featureKey: row.featureKey ?? "",
  };
}

function sortAscending(rows: ArtifactCard[]): ArtifactCard[] {
  return [...rows].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }));
}

function isAdmin(session: SessionUser | null): boolean {
  return Boolean(session?.roles.includes("administrator"));
}

function canEditStage(stage: "story" | "design" | "code" | "test", session: SessionUser | null): boolean {
  if (!session) {
    return false;
  }
  if (isAdmin(session)) {
    return true;
  }
  if (stage === "story") {
    return hasRole("product_owner", session) || hasPermission("requirement:create", session);
  }
  if (stage === "design") {
    return hasRole("architect", session) || hasPermission("design:create", session);
  }
  if (stage === "code") {
    return hasRole("developer", session);
  }
  return hasRole("qa_reviewer", session) || hasPermission("test:create", session);
}

function canApprove(session: SessionUser | null): boolean {
  return isAdmin(session) || hasPermission("artifact:approve", session);
}

function parseCodeCard(content: string): {
  summary: string;
  repoPath: string;
  files: Array<{ path: string; action: string }>;
  diff: string;
} | null {
  if (!content.includes("## Diff") && !content.includes("setwin-code-change")) {
    return null;
  }
  const summary = content.match(/## Summary\s*\n([\s\S]*?)(?=\n## )/i)?.[1]?.trim() ?? "";
  const repoPath = content.match(/## Repository\s*\n([^\n]+)/i)?.[1]?.trim() ?? "";
  const diff = content.match(/## Diff\s*\n```diff\s*([\s\S]*?)```/i)?.[1]?.trim() ?? "";
  let files: Array<{ path: string; action: string }> = [];
  const meta = content.match(/<!-- setwin-code-change -->\s*```json\s*([\s\S]*?)```/i);
  if (meta) {
    try {
      const parsed = JSON.parse(meta[1]) as { files?: Array<{ path: string; action: string }> };
      files = parsed.files ?? [];
    } catch {
      files = [];
    }
  }
  return { summary, repoPath, files, diff };
}

function ColumnPane({
  title,
  badge,
  widthPct,
  heightPx,
  onColResizeStart,
  onRowResizeStart,
  onExpand,
  children,
}: {
  title: string;
  badge?: string;
  widthPct: number;
  heightPx: number;
  onColResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRowResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onExpand?: () => void;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    flex: `0 0 ${widthPct}%`,
    width: `${widthPct}%`,
    minWidth: 180,
    height: heightPx,
    maxHeight: heightPx,
  };
  return (
    <section className="workspace-col" style={style}>
      <div className="workspace-col-head">
        <span className="workspace-pane-title">{title}</span>
        <div className="workspace-col-head-actions">
          {badge ? <span className="workspace-pane-badge">{badge}</span> : null}
          {onExpand ? (
            <button type="button" className="icon-btn pane-expand-btn" title={`Expand ${title}`} onClick={onExpand}>
              ↗
            </button>
          ) : null}
        </div>
      </div>
      <div className="workspace-col-body">{children}</div>
      {onColResizeStart ? (
        <div
          className="workspace-col-resize"
          onPointerDown={onColResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="Drag sideways to resize width"
        />
      ) : null}
      {onRowResizeStart ? (
        <div
          className="workspace-row-resize"
          onPointerDown={onRowResizeStart}
          role="separator"
          aria-orientation="horizontal"
          title="Drag down to expand height"
        />
      ) : null}
    </section>
  );
}

export function WorkspacePage() {
  const [session, setSession] = useState<SessionUser | null>(getSessionUser());
  const [projects, setProjects] = useState<Project[]>([]);
  const [features, setFeatures] = useState<FeatureOption[]>([]);
  const [project, setProject] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptHeight, setPromptHeight] = useState(140);
  const [colWidths, setColWidths] = useState([25, 25, 25, 25]);
  const [columnsHeight, setColumnsHeight] = useState(420);
  const [stories, setStories] = useState<ArtifactCard[]>([]);
  const [designs, setDesigns] = useState<ArtifactCard[]>([]);
  const [codes, setCodes] = useState<ArtifactCard[]>([]);
  const [tests, setTests] = useState<ArtifactCard[]>([]);
  const [relationships, setRelationships] = useState<Rel[]>([]);
  const [codeTestsDone, setCodeTestsDone] = useState<Record<string, boolean>>({});
  const [filterFeature, setFilterFeature] = useState("");
  const [filterStory, setFilterStory] = useState("");
  const [activeStoriesOnly, setActiveStoriesOnly] = useState(true);
  const [attachmentsByKey, setAttachmentsByKey] = useState<Record<string, AttachmentMeta[]>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [expandedPane, setExpandedPane] = useState<"prompt" | "story" | "design" | "code" | "test" | null>(null);
  const [selectedTestKeys, setSelectedTestKeys] = useState<Set<string>>(new Set());
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const promptResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const colResizeRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);
  const rowResizeRef = useRef<{ startY: number; startH: number } | null>(null);

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

  const loadFeatures = useCallback(async (projectKey: string) => {
    if (!projectKey || !getToken()) {
      setFeatures([]);
      return;
    }
    try {
      const rows = await apiGet<FeatureOption[]>(`/features?project=${encodeURIComponent(projectKey)}`);
      setFeatures(
        [...rows].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
      );
    } catch {
      setFeatures([]);
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
      setLogs((sessionLogs) => {
        const sessionOnly = sessionLogs.filter((row) => !row.id.startsWith("audit-"));
        return [...mapped, ...sessionOnly].slice(-200);
      });
    } catch {
      // keep session logs
    }
  }, []);

  const loadPipeline = useCallback(async (projectKey: string) => {
    if (!getToken() || !projectKey) {
      return;
    }
    try {
      const status = await apiGet<{
        stages: Array<{ stage: { id: string }; artifacts: ArtifactCard[] }>;
        relationships: Rel[];
      }>(`/pipeline/${projectKey}`);
      const all = status.stages.flatMap((row) => row.artifacts.map(toCard));
      const featureLinks = new Map<string, string>();
      for (const rel of status.relationships ?? []) {
        if (rel.type === "CONTAINS") {
          featureLinks.set(rel.to.toUpperCase(), rel.from.toUpperCase());
        }
      }
      const withFeature = all.map((row) =>
        toCard({
          ...row,
          featureKey: featureLinks.get(row.key) ?? row.featureKey ?? "",
        }),
      );
      setStories(sortAscending(withFeature.filter((row) => STORY_TYPES.has(row.type))));
      setDesigns(sortAscending(withFeature.filter((row) => DESIGN_TYPES.has(row.type))));
      setCodes(sortAscending(withFeature.filter((row) => CODE_TYPES.has(row.type))));
      setTests(sortAscending(withFeature.filter((row) => TEST_TYPES.has(row.type))));
      setRelationships(status.relationships ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    if (project) {
      void loadPipeline(project);
      void loadFeatures(project);
    }
    setFilterFeature("");
    setFilterStory("");
    setActiveStoriesOnly(true);
  }, [project, loadPipeline, loadFeatures]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, activityOpen]);

  useEffect(() => {
    function onMove(event: PointerEvent): void {
      if (promptResizeRef.current) {
        const delta = event.clientY - promptResizeRef.current.startY;
        setPromptHeight(Math.max(90, Math.min(360, promptResizeRef.current.startH + delta)));
      }
      if (colResizeRef.current) {
        const { index, startX, startWidths } = colResizeRef.current;
        const container = document.querySelector(".workspace-columns") as HTMLElement | null;
        if (!container) {
          return;
        }
        const total = container.clientWidth || 1;
        const deltaPct = ((event.clientX - startX) / total) * 100;
        const next = [...startWidths];
        const left = Math.max(14, Math.min(50, startWidths[index]! + deltaPct));
        const right = Math.max(14, Math.min(50, startWidths[index + 1]! - deltaPct));
        const used = left + right;
        const orig = startWidths[index]! + startWidths[index + 1]!;
        next[index] = left;
        next[index + 1] = right + (orig - used);
        const sum = next.reduce((a, b) => a + b, 0);
        setColWidths(next.map((w) => (w / sum) * 100));
      }
      if (rowResizeRef.current) {
        const delta = event.clientY - rowResizeRef.current.startY;
        setColumnsHeight(Math.max(240, Math.min(900, rowResizeRef.current.startH + delta)));
      }
    }
    function onUp(): void {
      promptResizeRef.current = null;
      colResizeRef.current = null;
      rowResizeRef.current = null;
      document.body.classList.remove("is-resizing");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function patchList(setter: typeof setStories, key: string, patch: Partial<ArtifactCard>): void {
    setter((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function upsertSorted(setter: typeof setStories, rows: ArtifactCard[]): void {
    setter((prev) => {
      const map = new Map(prev.map((row) => [row.key, row]));
      for (const row of rows.map(toCard)) {
        map.set(row.key, { ...map.get(row.key), ...row });
      }
      return sortAscending([...map.values()]);
    });
  }

  function keysLinkedTo(sourceKey: string): Set<string> {
    const key = sourceKey.toUpperCase();
    const related = new Set<string>();
    for (const rel of relationships) {
      if (rel.from.toUpperCase() === key) {
        related.add(rel.to.toUpperCase());
      }
      if (rel.to.toUpperCase() === key) {
        related.add(rel.from.toUpperCase());
      }
    }
    return related;
  }

  function designCodeTestsComplete(designKey: string): boolean {
    const linked = keysLinkedTo(designKey);
    const hasCode = codes.some((row) => linked.has(row.key.toUpperCase()));
    const linkedTests = tests.filter((row) => linked.has(row.key.toUpperCase()));
    const packedMultiScenario = linkedTests.some(
      (row) => (row.currentVersion.content.match(/^\s*Scenario(?: Outline)?:/gim) ?? []).length > 1,
    );
    // Allow re-run when an older run packed multiple Scenarios into one TST card.
    if (packedMultiScenario) {
      return false;
    }
    // Allow re-run when only the generic placeholder Happy path exists (under-produced).
    const onlyPlaceholder =
      linkedTests.length === 1 &&
      /Scenario:\s*Happy path/i.test(linkedTests[0]!.currentVersion.content) &&
      /the precondition is met/i.test(linkedTests[0]!.currentVersion.content);
    if (onlyPlaceholder) {
      return false;
    }
    if (codeTestsDone[designKey]) {
      return true;
    }
    return hasCode && linkedTests.length > 0;
  }

  /** Story + its designs + code/tests linked to the story or those designs (not sibling stories). */
  function storyClosureKeys(storyKey: string): Set<string> {
    const key = storyKey.toUpperCase();
    const related = keysLinkedTo(key);
    related.add(key);
    for (const design of designs) {
      if (!related.has(design.key.toUpperCase())) {
        continue;
      }
      for (const linked of keysLinkedTo(design.key)) {
        related.add(linked);
      }
    }
    return related;
  }

  function storyIsImplemented(story: ArtifactCard): boolean {
    const related = storyClosureKeys(story.key);
    const codeApproved = codes.some(
      (row) => related.has(row.key.toUpperCase()) && row.currentVersion.workflowState === "APPROVED",
    );
    const testApproved = tests.some(
      (row) => related.has(row.key.toUpperCase()) && row.currentVersion.workflowState === "APPROVED",
    );
    return codeApproved && testApproved;
  }

  const storiesForFeature = filterFeature
    ? stories.filter((row) => (row.featureKey ?? "").toUpperCase() === filterFeature.toUpperCase())
    : stories;

  const filteredStories = sortAscending(
    storiesForFeature.filter((row) => {
      if (filterStory && row.key.toUpperCase() !== filterStory.toUpperCase()) {
        return false;
      }
      if (activeStoriesOnly && storyIsImplemented(row)) {
        return false;
      }
      return true;
    }),
  );

  const filteredStoryKeys = new Set(filteredStories.map((row) => row.key.toUpperCase()));
  const filterActive = Boolean(filterFeature || filterStory || activeStoriesOnly);

  const filteredRelatedKeys = (() => {
    if (!filterActive) {
      return null as Set<string> | null;
    }
    const keys = new Set<string>();
    if (filterFeature) {
      keys.add(filterFeature.toUpperCase());
    }
    for (const story of filteredStories) {
      for (const linked of storyClosureKeys(story.key)) {
        keys.add(linked);
      }
    }
    // Feature-only (no matching stories yet): still show artifacts linked directly to the feature.
    if (filterFeature && filteredStories.length === 0 && !filterStory && !activeStoriesOnly) {
      for (const linked of keysLinkedTo(filterFeature)) {
        keys.add(linked);
      }
    }
    return keys;
  })();

  function matchesWorkspaceFilter(row: ArtifactCard): boolean {
    if (!filteredRelatedKeys) {
      return true;
    }
    return filteredRelatedKeys.has(row.key.toUpperCase()) || filteredStoryKeys.has(row.key.toUpperCase());
  }

  const filteredDesigns = sortAscending(designs.filter(matchesWorkspaceFilter));
  const filteredCodes = sortAscending(codes.filter(matchesWorkspaceFilter));
  const filteredTests = sortAscending(tests.filter(matchesWorkspaceFilter));

  async function loadAttachments(key: string): Promise<void> {
    try {
      const payload = await apiGet<{ attachments: AttachmentMeta[] }>(`/artifacts/${key}/attachments`);
      setAttachmentsByKey((prev) => ({ ...prev, [key]: payload.attachments }));
    } catch {
      // optional
    }
  }

  useEffect(() => {
    for (const row of designs) {
      if (!(row.key in attachmentsByKey)) {
        void loadAttachments(row.key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs]);

  async function runPrompt(): Promise<void> {
    if (!getToken()) {
      setError("Sign in on the Dashboard first.");
      return;
    }
    if (!project) {
      setError("Create a SETwin project first.");
      return;
    }
    if (!canEditStage("story", session)) {
      setError("Only product_owner (or admin) can create stories.");
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
      upsertSorted(
        setStories,
        batch.stories.map((row) => ({ ...row, featureKey: "" })),
      );
      pushLog(`${batch.stories.length} story DRAFT(s) created (ai=${batch.aiStatus})`, "ok");
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

  async function saveCard(row: ArtifactCard, stage: "story" | "design" | "code" | "test"): Promise<void> {
    if (!canEditStage(stage, session)) {
      setError(`Your role cannot edit ${stage} artifacts.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let content = row.draftContent ?? "";
      if (stage === "design" && row.referencesText?.trim() && !content.includes("## References")) {
        content = `${content.trim()}\n\n## References\n${row.referencesText.trim()}\n`;
      }
      const updated = await apiPost<ArtifactCard>(
        stage === "story" ? `/stories/${row.key}` : `/artifacts/${row.key}/save`,
        { title: row.draftTitle, content },
      );
      const card = toCard({ ...updated, featureKey: row.featureKey });
      if (stage === "story") {
        upsertSorted(setStories, [card]);
      } else if (stage === "design") {
        upsertSorted(setDesigns, [card]);
      } else if (stage === "code") {
        upsertSorted(setCodes, [card]);
      } else {
        upsertSorted(setTests, [card]);
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

  async function submitCard(row: ArtifactCard, stage: "story" | "design" | "code" | "test"): Promise<void> {
    if (!canEditStage(stage, session)) {
      setError(`Your role cannot submit ${stage} artifacts.`);
      return;
    }
    if (stage === "story" && !row.featureKey) {
      setError("Select a Feature before submitting this story for review.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await apiPost<ArtifactCard>(`/artifacts/${row.key}/submit`, {
        comment: "Submitted from Workspace",
        featureKey: stage === "story" ? row.featureKey : undefined,
      });
      const card = toCard({ ...updated, featureKey: row.featureKey });
      if (stage === "story") {
        upsertSorted(setStories, [card]);
      } else if (stage === "design") {
        upsertSorted(setDesigns, [card]);
      } else if (stage === "code") {
        upsertSorted(setCodes, [card]);
      } else {
        upsertSorted(setTests, [card]);
      }
      pushLog(`${row.key} submitted → ${updated.currentVersion.workflowState}`, "ok");
      await refreshAudit();
      if (project) {
        await loadPipeline(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitSelectedTests(): Promise<void> {
    if (!canEditStage("test", session)) {
      setError("Your role cannot submit test artifacts.");
      return;
    }
    const rows = filteredTests.filter(
      (row) => selectedTestKeys.has(row.key) && row.currentVersion.workflowState === "DRAFT",
    );
    if (!rows.length) {
      setError("Select draft tests to submit.");
      return;
    }
    setBusy(true);
    setError("");
    const failed: string[] = [];
    let submitted = 0;
    for (const row of rows) {
      try {
        const updated = await apiPost<ArtifactCard>(`/artifacts/${row.key}/submit`, {
          comment: "Submitted from Workspace",
        });
        upsertSorted(setTests, [toCard(updated)]);
        submitted += 1;
        pushLog(`${row.key} submitted → ${updated.currentVersion.workflowState}`, "ok");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push(`${row.key}: ${message}`);
        pushLog(`${row.key}: ${message}`, "error");
      }
    }
    setSelectedTestKeys(new Set());
    if (failed.length) {
      setError(`Submitted ${submitted}. Failed ${failed.length}: ${failed[0]}`);
    }
    await refreshAudit();
    if (project) {
      await loadPipeline(project);
    }
    setBusy(false);
  }

  async function rejectSelectedTests(): Promise<void> {
    const reason = bulkRejectReason.trim();
    if (!reason) {
      setError("Enter a reason to reject the selected tests.");
      return;
    }
    const rows = filteredTests.filter(
      (row) => selectedTestKeys.has(row.key) && row.currentVersion.workflowState === "IN_REVIEW",
    );
    if (!rows.length) {
      setError("Select tests that are in review to reject.");
      return;
    }
    setBusy(true);
    setError("");
    const failed: string[] = [];
    let rejected = 0;
    for (const row of rows) {
      try {
        await apiPost(`/artifacts/${row.key}/review/decide`, {
          decision: "REJECT",
          comment: reason,
        });
        const updated = await apiGet<ArtifactCard>(`/artifacts/${row.key}`);
        upsertSorted(setTests, [toCard({ ...updated, decisionReason: reason })]);
        rejected += 1;
        pushLog(`${row.key} decision REJECT`, "ok");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push(`${row.key}: ${message}`);
        pushLog(`${row.key}: ${message}`, "error");
      }
    }
    setSelectedTestKeys(new Set());
    if (failed.length) {
      setError(`Rejected ${rejected}. Failed ${failed.length}: ${failed[0]}`);
    }
    await refreshAudit();
    if (project) {
      await loadPipeline(project);
    }
    setBusy(false);
  }

  function renderTestBulkBar() {
    if (filteredTests.length <= 5) {
      return null;
    }
    const selectedCount = filteredTests.filter((row) => selectedTestKeys.has(row.key)).length;
    const allSelected = filteredTests.length > 0 && selectedCount === filteredTests.length;
    const selectedDrafts = filteredTests.filter(
      (row) => selectedTestKeys.has(row.key) && row.currentVersion.workflowState === "DRAFT",
    ).length;
    const selectedInReview = filteredTests.filter(
      (row) => selectedTestKeys.has(row.key) && row.currentVersion.workflowState === "IN_REVIEW",
    ).length;
    return (
      <>
        <label className="test-select">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={busy || filteredTests.length === 0}
            onChange={() =>
              setSelectedTestKeys(allSelected ? new Set() : new Set(filteredTests.map((row) => row.key)))
            }
          />
          <span>
            Select all ({selectedCount}/{filteredTests.length})
          </span>
        </label>
        <button
          type="button"
          disabled={busy || selectedDrafts === 0 || !canEditStage("test", session)}
          onClick={() => void submitSelectedTests()}
        >
          Submit selected
        </button>
        <button
          type="button"
          disabled={busy || selectedInReview === 0 || !canApprove(session)}
          onClick={() => void rejectSelectedTests()}
        >
          Reject selected
        </button>
        <input
          className="test-bulk-reason"
          value={bulkRejectReason}
          disabled={busy}
          placeholder="Reject reason…"
          onChange={(event) => setBulkRejectReason(event.target.value)}
        />
      </>
    );
  }

  async function decideCard(
    row: ArtifactCard,
    decision: "APPROVE" | "REJECT" | "CHANGES_REQUESTED",
    stage: "story" | "design" | "code" | "test",
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
      const card = toCard({ ...updated, decisionReason: reason, featureKey: row.featureKey });
      if (stage === "story") {
        upsertSorted(setStories, [card]);
      } else if (stage === "design") {
        upsertSorted(setDesigns, [card]);
      } else if (stage === "code") {
        upsertSorted(setCodes, [card]);
      } else {
        upsertSorted(setTests, [card]);
      }
      pushLog(`${row.key} decision ${decision}`, "ok");
      await refreshAudit();
      if (project) {
        await loadPipeline(project);
      }
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
    stage: "story" | "design" | "code" | "test",
    resubmit: boolean,
  ): Promise<void> {
    const reason = (row.decisionReason ?? "").trim();
    if (!reason) {
      setError("Enter the rejection / change reason for the agent to address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await apiPost<ArtifactCard & { aiStatus: string; resubmitted: boolean }>(
        `/artifacts/${row.key}/revise-from-rejection`,
        { reason, resubmit },
      );
      const card = toCard({ ...updated, decisionReason: "", featureKey: row.featureKey });
      if (stage === "story") {
        upsertSorted(setStories, [card]);
      } else if (stage === "design") {
        upsertSorted(setDesigns, [card]);
      } else if (stage === "code") {
        upsertSorted(setCodes, [card]);
      } else {
        upsertSorted(setTests, [card]);
      }
      pushLog(`${row.key} revised (ai=${updated.aiStatus})`, "ok");
      await refreshAudit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  /** Story-level advance → design. LLM receives full feature + all stories context. */
  async function advanceDesignForStory(story: ArtifactCard): Promise<void> {
    if (story.currentVersion.workflowState !== "APPROVED") {
      setError("Story must be APPROVED before advancing to Design.");
      return;
    }
    if (!canEditStage("design", session)) {
      setError("Architect role (or admin) required.");
      return;
    }
    setBusy(true);
    setError("");
    pushLog(`Advance Design for ${story.key} (LLM context = feature + all stories)…`, "info");
    try {
      const result = await apiPost<{
        blockedReason?: string;
        created: ArtifactCard[];
        reused: ArtifactCard[];
      }>("/pipeline/advance", {
        project,
        targetStage: "design",
        sourceKeys: [story.key],
        reuseExisting: true,
      });
      if (result.blockedReason) {
        setError(result.blockedReason);
        pushLog(result.blockedReason, "warn");
      }
      upsertSorted(setDesigns, [...result.created, ...result.reused]);
      for (const row of [...result.created, ...result.reused]) {
        pushLog(`${row.key} design ready`, "ok");
        void loadAttachments(row.key);
      }
      await refreshAudit();
      if (project) {
        await loadPipeline(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  /** From an approved design: reuse/modify/add code (+ unit tests, auto code-review) and Gherkin tests. */
  async function advanceCodeAndTestsFromDesign(design: ArtifactCard): Promise<void> {
    if (designCodeTestsComplete(design.key)) {
      setError("Code + Tests already generated for this design.");
      return;
    }
    if (design.currentVersion.workflowState !== "APPROVED") {
      setError("Design must be APPROVED before advancing Code + Tests.");
      return;
    }
    if (!(canEditStage("code", session) || canEditStage("test", session))) {
      setError("Developer and/or QA role required to start Code + Tests.");
      return;
    }
    setBusy(true);
    setError("");
    pushLog(`Code+Tests from ${design.key}: reuse/modify/add code+unit tests (auto review) and Gherkin…`, "info");
    try {
      const result = await apiPost<{
        code: ArtifactCard & { aiStatus?: string; aiError?: string; reused?: boolean; submitted?: boolean };
        tests: Array<ArtifactCard & { aiStatus?: string; aiError?: string; reused?: boolean }> | (ArtifactCard & { aiStatus?: string; aiError?: string; reused?: boolean });
      }>("/pipeline/code-and-tests", {
        project,
        designKey: design.key,
      });
      const testRows = Array.isArray(result.tests) ? result.tests : result.tests ? [result.tests] : [];
      upsertSorted(setCodes, [result.code]);
      if (testRows.length) {
        upsertSorted(setTests, testRows);
      }
      setCodeTestsDone((prev) => ({ ...prev, [design.key]: true }));
      if (result.code.reused) {
        pushLog(`${result.code.key} CODE reused (${result.code.currentVersion.workflowState})`, "ok");
      } else {
        pushLog(
          `${result.code.key} CODE ${result.code.submitted ? "submitted for review" : "ready"} (ai=${result.code.aiStatus})`,
          "ok",
        );
      }
      if (result.code.aiError) {
        pushLog(`Code note: ${result.code.aiError}`, "warn");
      }
      for (const test of testRows) {
        if (test.reused) {
          pushLog(`${test.key} Gherkin reused`, "ok");
        } else {
          pushLog(`${test.key} Gherkin ${test.currentVersion.workflowState} (ai=${test.aiStatus})`, "ok");
        }
        if (test.aiError) {
          pushLog(`Tests note (${test.key}): ${test.aiError}`, "warn");
        }
      }
      await refreshAudit();
      if (project) {
        await loadPipeline(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function addTestScenario(): Promise<void> {
    if (!project) {
      setError("Select a product first.");
      return;
    }
    if (!canEditStage("test", session)) {
      setError("QA role required to add tests.");
      return;
    }
    const storyKey =
      filterStory ||
      filteredStories[0]?.key ||
      stories.find((row) => row.currentVersion.workflowState === "APPROVED")?.key ||
      stories[0]?.key;
    const designKey = filteredDesigns[0]?.key || designs[0]?.key;
    const title = "New scenario";
    const content = [
      `Feature: ${title}`,
      "",
      `  Scenario: ${title}`,
      "    Given the precondition is met",
      "    When the primary action occurs",
      "    Then the expected outcome is observed",
    ].join("\n");
    setBusy(true);
    setError("");
    try {
      const created = await apiPost<{ artifact: ArtifactCard }>("/gherkin", {
        project,
        title,
        content,
        requirement: storyKey,
        provenanceSource: "HUMAN_AUTHORED",
      });
      const card = toCard(created.artifact);
      upsertSorted(setTests, [card]);
      if (designKey) {
        try {
          await apiPost("/relationships", {
            from: card.key,
            to: designKey,
            type: "TESTED_BY",
            source: "HUMAN",
          });
        } catch {
          // optional link
        }
      }
      pushLog(`Added test ${card.key}`, "ok");
      if (project) {
        await loadPipeline(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTestCard(row: ArtifactCard): Promise<void> {
    if (!canEditStage("test", session) && !isAdmin(session)) {
      setError("QA or admin required to delete tests.");
      return;
    }
    if (row.currentVersion.workflowState !== "DRAFT" && !isAdmin(session)) {
      setError("Only DRAFT tests can be deleted (or admin).");
      return;
    }
    if (
      !window.confirm(
        `Permanently delete test ${row.key}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/artifacts/${row.key}?permanent=true`);
      setTests((prev) => prev.filter((item) => item.key !== row.key));
      pushLog(`Permanently deleted ${row.key}`, "ok");
      if (project) {
        await loadPipeline(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAttachment(row: ArtifactCard, att: AttachmentMeta): Promise<void> {
    if (!canEditStage("design", session) && !isAdmin(session)) {
      setError("Only design editors can remove attachments.");
      return;
    }
    const state = row.currentVersion.workflowState;
    if (state !== "DRAFT" && state !== "REJECTED" && state !== "CHANGES_REQUESTED") {
      setError("Attachments can only be removed before submit or while revising.");
      return;
    }
    if (!window.confirm(`Remove attachment “${att.name}”?`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/artifacts/${row.key}/attachments/${encodeURIComponent(att.id)}`);
      setAttachmentsByKey((prev) => ({
        ...prev,
        [row.key]: (prev[row.key] ?? []).filter((item) => item.id !== att.id),
      }));
      // Drop markdown image embeds that reference this attachment name/url.
      const content = row.draftContent ?? "";
      const nextContent = content
        .split(/\r?\n/)
        .filter((line) => !(line.includes(att.name) && /!\[[^\]]*\]\([^)]+\)/.test(line)))
        .join("\n");
      if (nextContent !== content) {
        patchList(setDesigns, row.key, { draftContent: nextContent });
      }
      pushLog(`Removed attachment ${att.name}`, "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachment(row: ArtifactCard, file: File): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const meta = await apiPost<AttachmentMeta>(`/artifacts/${row.key}/attachments`, {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
      });
      setAttachmentsByKey((prev) => ({
        ...prev,
        [row.key]: [...(prev[row.key] ?? []), meta].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      patchList(setDesigns, row.key, { draftContent: `${row.draftContent ?? ""}\n\n![${meta.name}](${meta.url})\n` });
      pushLog(`Uploaded ${meta.name}`, "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderArtifactCard(row: ArtifactCard, stage: "story" | "design" | "code" | "test") {
    const state = row.currentVersion.workflowState;
    const editableBase = state === "DRAFT" || state === "REJECTED" || state === "CHANGES_REQUESTED";
    const canEdit = editableBase && canEditStage(stage, session);
    const setter =
      stage === "story" ? setStories : stage === "design" ? setDesigns : stage === "code" ? setCodes : setTests;

    return (
      <article key={`${row.key}-v${row.currentVersion.version}-${state}`} className="workspace-card">
        <div className="workspace-card-meta">
          {stage === "test" && filteredTests.length > 5 ? (
            <label className="test-select">
              <input
                type="checkbox"
                checked={selectedTestKeys.has(row.key)}
                disabled={busy}
                onChange={() =>
                  setSelectedTestKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.key)) {
                      next.delete(row.key);
                    } else {
                      next.add(row.key);
                    }
                    return next;
                  })
                }
              />
            </label>
          ) : null}
          <strong>
            {row.key} · {row.type === "GHERKIN" ? "TEST" : row.type}
          </strong>
          <span className="muted">
            v{row.currentVersion.version} · {state}
          </span>
        </div>
        <input
          className="workspace-title-input"
          value={row.draftTitle ?? ""}
          disabled={busy || !canEdit}
          onChange={(event) => patchList(setter, row.key, { draftTitle: event.target.value })}
        />
        {stage === "story" ? (
          <label className="workspace-feature-pick">
            <span className="muted">Feature</span>
            <select
              value={row.featureKey ?? ""}
              disabled={busy || (!canEdit && state !== "DRAFT")}
              onChange={(event) => patchList(setter, row.key, { featureKey: event.target.value })}
            >
              <option value="">— select feature —</option>
              {features.map((fea) => (
                <option key={fea.key} value={fea.key}>
                  {fea.key} — {fea.currentVersion.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {stage === "code" ? (
          (() => {
            const parsed = parseCodeCard(row.draftContent ?? "");
            if (!parsed) {
              return (
                <textarea
                  className="workspace-prompt workspace-card-body"
                  value={row.draftContent ?? ""}
                  disabled={busy || !canEdit}
                  onChange={(event) => patchList(setter, row.key, { draftContent: event.target.value })}
                />
              );
            }
            return (
              <div className="code-change-card">
                <p className="code-change-summary">{parsed.summary || "Code change set written to the product repo."}</p>
                {parsed.repoPath ? (
                  <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
                    Repo: <code>{parsed.repoPath}</code> (working tree, uncommitted)
                  </p>
                ) : null}
                <ul className="code-file-list">
                  {parsed.files.map((file) => (
                    <li key={`${file.action}:${file.path}`}>
                      <span className={`file-action file-action-${file.action}`}>{file.action}</span>{" "}
                      <code>{file.path}</code>
                    </li>
                  ))}
                </ul>
                <pre className="code-diff">{parsed.diff || "(no diff captured)"}</pre>
                {canEdit ? (
                  <details className="code-raw-edit">
                    <summary className="muted">Edit raw summary / metadata</summary>
                    <textarea
                      className="workspace-prompt workspace-card-body"
                      value={row.draftContent ?? ""}
                      disabled={busy}
                      onChange={(event) => patchList(setter, row.key, { draftContent: event.target.value })}
                    />
                  </details>
                ) : null}
              </div>
            );
          })()
        ) : (
          <textarea
            className="workspace-prompt workspace-card-body"
            value={row.draftContent ?? ""}
            disabled={busy || !canEdit}
            onChange={(event) => patchList(setter, row.key, { draftContent: event.target.value })}
            placeholder={stage === "test" ? "Feature: …\n  Scenario: …" : undefined}
          />
        )}
        {stage === "design" ? (
          <div className="workspace-design-extras">
            <label className={`file-upload-btn ${busy || !canEdit ? "is-disabled" : ""}`}>
              Upload image / file
              <input
                type="file"
                accept="image/*,.pdf,.md,.txt,.png,.jpg,.jpeg,.gif,.webp"
                disabled={busy || !canEdit}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadAttachment(row, file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            {(attachmentsByKey[row.key] ?? []).map((att) => (
              <span key={att.id} className="workspace-attach-row">
                <a
                  className="workspace-attach-link"
                  href={
                    /^https?:\/\//i.test(att.url) && !att.url.includes("/attachments/")
                      ? att.url
                      : `/api${att.url.startsWith("/") ? att.url : `/${att.url}`}${
                          getToken()
                            ? `${att.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(getToken())}`
                            : ""
                        }`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {att.name}
                </a>
                {canEdit || state === "DRAFT" || state === "REJECTED" || state === "CHANGES_REQUESTED" ? (
                  <button
                    type="button"
                    className="workspace-attach-remove"
                    title={`Remove ${att.name}`}
                    disabled={busy || !(canEditStage("design", session) || isAdmin(session))}
                    onClick={() => void removeAttachment(row, att)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className="toolbar workspace-actions">
          {canEdit ? (
            <button type="button" disabled={busy} onClick={() => void saveCard(row, stage)}>
              Save
            </button>
          ) : null}
          {stage === "test" && (state === "DRAFT" || isAdmin(session)) && canEditStage("test", session) ? (
            <button type="button" disabled={busy} onClick={() => void deleteTestCard(row)}>
              Delete
            </button>
          ) : null}
          {state === "DRAFT" && canEditStage(stage, session) ? (
            <button type="button" disabled={busy} onClick={() => void submitCard(row, stage)}>
              Submit for approval
            </button>
          ) : null}
          {state === "IN_REVIEW" ? (
            <>
              <button type="button" disabled={busy || !canApprove(session)} onClick={() => void decideCard(row, "APPROVE", stage)}>
                Accept
              </button>
              <button
                type="button"
                disabled={busy || !(isAdmin(session) || hasPermission("artifact:reject", session))}
                onClick={() => void decideCard(row, "REJECT", stage)}
              >
                Reject
              </button>
            </>
          ) : null}
          {(state === "REJECTED" || state === "CHANGES_REQUESTED") && canEditStage(stage, session) ? (
            <button type="button" disabled={busy} onClick={() => void reviseFromRejection(row, stage, true)}>
              Agent revise + resubmit
            </button>
          ) : null}
          {stage === "story" && state === "APPROVED" ? (
            <button
              type="button"
              disabled={busy || !canEditStage("design", session)}
              onClick={() => void advanceDesignForStory(row)}
            >
              → Design
            </button>
          ) : null}
          {stage === "design" && state === "APPROVED" ? (
            <button
              type="button"
              disabled={
                busy ||
                designCodeTestsComplete(row.key) ||
                !(canEditStage("code", session) || canEditStage("test", session))
              }
              title={designCodeTestsComplete(row.key) ? "Code + Tests already generated" : undefined}
              onClick={() => void advanceCodeAndTestsFromDesign(row)}
            >
              {designCodeTestsComplete(row.key) ? "Code+Tests done" : "→ Code+Tests"}
            </button>
          ) : null}
        </div>
        {(state === "IN_REVIEW" || state === "REJECTED" || state === "CHANGES_REQUESTED") && (
          <textarea
            className="workspace-prompt"
            style={{ minHeight: "2.8rem", marginTop: "0.4rem" }}
            value={row.decisionReason ?? ""}
            disabled={busy}
            onChange={(event) => patchList(setter, row.key, { decisionReason: event.target.value })}
            placeholder="Rejection / change reason…"
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
          <p>
            Prompt → Stories (attach Feature) → Design (feature+stories context) → parallel Code / Tests. Advances are
            per story; LLM uses full feature context.
          </p>
        </div>
        <div className="toolbar workspace-header-filters" style={{ marginBottom: 0 }}>
          <label className="workspace-filter-field">
            <span className="muted">Product</span>
            <select value={project} onChange={(event) => setProject(event.target.value)} disabled={projects.length === 0}>
              {projects.length === 0 ? <option value="">No project</option> : null}
              {projects.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.key} — {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="workspace-filter-field">
            <span className="muted">Feature</span>
            <select
              value={filterFeature}
              disabled={!project || features.length === 0}
              onChange={(event) => {
                const next = event.target.value;
                setFilterFeature(next);
                if (
                  filterStory &&
                  next &&
                  !stories.some(
                    (row) =>
                      row.key.toUpperCase() === filterStory.toUpperCase() &&
                      (row.featureKey ?? "").toUpperCase() === next.toUpperCase(),
                  )
                ) {
                  setFilterStory("");
                }
              }}
            >
              <option value="">All features</option>
              {features.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.key} — {row.currentVersion.title}
                </option>
              ))}
            </select>
          </label>
          <label className="workspace-filter-field">
            <span className="muted">Story</span>
            <select
              value={filterStory}
              disabled={!project || storiesForFeature.length === 0}
              onChange={(event) => setFilterStory(event.target.value)}
            >
              <option value="">All stories</option>
              {sortAscending(storiesForFeature).map((row) => (
                <option key={row.key} value={row.key}>
                  {row.key} — {row.draftTitle || row.currentVersion.title}
                </option>
              ))}
            </select>
          </label>
          <label className="workspace-filter-check" title="Show only stories that do not yet have approved code and tests">
            <input
              type="checkbox"
              checked={activeStoriesOnly}
              disabled={!project}
              onChange={(event) => setActiveStoriesOnly(event.target.checked)}
            />
            <span>Active stories</span>
          </label>
          <button type="button" disabled={busy || !project} onClick={() => void loadPipeline(project)}>
            Refresh
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Activity log"
            onClick={() => {
              setActivityOpen(true);
              void refreshAudit();
            }}
          >
            ⏱
          </button>
          <Link to="/setup" className="muted">
            Setup
          </Link>
          {!getToken() ? (
            <Link to="/" className="error">
              Sign in
            </Link>
          ) : (
            <span className="muted">{session?.username}</span>
          )}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="workspace-prompt-pane" style={{ height: promptHeight }}>
        <div className="workspace-col-head">
          <span className="workspace-pane-title">Prompt</span>
          <div className="workspace-col-head-actions">
            <button
              type="button"
              disabled={busy || !prompt.trim() || !project || !canEditStage("story", session)}
              onClick={() => void runPrompt()}
            >
              {busy ? "Working…" : "Create stories"}
            </button>
            <button
              type="button"
              className="icon-btn pane-expand-btn"
              title="Expand Prompt"
              onClick={() => setExpandedPane("prompt")}
            >
              ↗
            </button>
          </div>
        </div>
        <textarea
          className="workspace-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Enter a product prompt…"
          disabled={busy || !canEditStage("story", session)}
        />
        <div
          className="workspace-resize-handle"
          onPointerDown={(event) => {
            event.preventDefault();
            promptResizeRef.current = { startY: event.clientY, startH: promptHeight };
            document.body.classList.add("is-resizing");
          }}
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize prompt"
        />
      </section>

      <div className="workspace-columns" style={{ height: columnsHeight, minHeight: columnsHeight }}>
        <ColumnPane
          title="Stories"
          badge={`${filteredStories.length}${filterActive ? `/${stories.length}` : ""}`}
          widthPct={colWidths[0]!}
          heightPx={columnsHeight}
          onExpand={() => setExpandedPane("story")}
          onColResizeStart={(event) => {
            event.preventDefault();
            colResizeRef.current = { index: 0, startX: event.clientX, startWidths: [...colWidths] };
            document.body.classList.add("is-resizing");
          }}
          onRowResizeStart={(event) => {
            event.preventDefault();
            rowResizeRef.current = { startY: event.clientY, startH: columnsHeight };
            document.body.classList.add("is-resizing");
          }}
        >
          <div className="workspace-scroll">
            {filteredStories.length === 0 ? (
              <p className="muted">
                {stories.length === 0
                  ? "Attach a Feature before submit. After approve: → Design. After design approve: → Code+Tests on the design card."
                  : "No stories match the current filters."}
              </p>
            ) : (
              filteredStories.map((row) => renderArtifactCard(row, "story"))
            )}
          </div>
        </ColumnPane>
        <ColumnPane
          title="Design"
          badge={`${filteredDesigns.length}${filterActive ? `/${designs.length}` : ""}`}
          widthPct={colWidths[1]!}
          heightPx={columnsHeight}
          onExpand={() => setExpandedPane("design")}
          onColResizeStart={(event) => {
            event.preventDefault();
            colResizeRef.current = { index: 1, startX: event.clientX, startWidths: [...colWidths] };
            document.body.classList.add("is-resizing");
          }}
          onRowResizeStart={(event) => {
            event.preventDefault();
            rowResizeRef.current = { startY: event.clientY, startH: columnsHeight };
            document.body.classList.add("is-resizing");
          }}
        >
          <div className="workspace-scroll">
            {filteredDesigns.length === 0 ? (
              <p className="muted">
                {designs.length === 0
                  ? "Approve a design to unlock → Code+Tests on that card."
                  : "No designs match the current filters."}
              </p>
            ) : (
              filteredDesigns.map((row) => renderArtifactCard(row, "design"))
            )}
          </div>
        </ColumnPane>
        <ColumnPane
          title="Code"
          badge={`${filteredCodes.length}${filterActive ? `/${codes.length}` : ""}`}
          widthPct={colWidths[2]!}
          heightPx={columnsHeight}
          onExpand={() => setExpandedPane("code")}
          onColResizeStart={(event) => {
            event.preventDefault();
            colResizeRef.current = { index: 2, startX: event.clientX, startWidths: [...colWidths] };
            document.body.classList.add("is-resizing");
          }}
          onRowResizeStart={(event) => {
            event.preventDefault();
            rowResizeRef.current = { startY: event.clientY, startH: columnsHeight };
            document.body.classList.add("is-resizing");
          }}
        >
          <div className="workspace-scroll">
            {filteredCodes.length === 0 ? (
              <p className="muted">
                {codes.length === 0
                  ? "After → Code+Tests, real files are written to the registered product repo. This column shows the summary and diff; Submit for approval opens code review."
                  : "No code matches the current filters."}
              </p>
            ) : (
              filteredCodes.map((row) => renderArtifactCard(row, "code"))
            )}
          </div>
        </ColumnPane>
        <ColumnPane
          title="Tests"
          badge={`${filteredTests.length}${filterActive ? `/${tests.length}` : ""}`}
          widthPct={colWidths[3]!}
          heightPx={columnsHeight}
          onExpand={() => setExpandedPane("test")}
          onRowResizeStart={(event) => {
            event.preventDefault();
            rowResizeRef.current = { startY: event.clientY, startH: columnsHeight };
            document.body.classList.add("is-resizing");
          }}
        >
          <div className="toolbar" style={{ marginBottom: "0.35rem" }}>
            <button
              type="button"
              disabled={busy || !project || !canEditStage("test", session)}
              onClick={() => void addTestScenario()}
            >
              + Add test
            </button>
            {renderTestBulkBar()}
          </div>
          <div className="workspace-scroll">
            {filteredTests.length === 0 ? (
              <p className="muted">
                {tests.length === 0
                  ? "No tests yet — run → Code+Tests on a design, or Add test."
                  : "No tests match the current filters."}
              </p>
            ) : (
              filteredTests.map((row) => renderArtifactCard(row, "test"))
            )}
          </div>
        </ColumnPane>
      </div>

      {expandedPane ? (
        <div className="modal-backdrop" onClick={() => setExpandedPane(null)}>
          <div className="modal-panel workspace-pane-modal" onClick={(event) => event.stopPropagation()}>
            <div className="workspace-col-head">
              <h2 style={{ margin: 0 }}>
                {expandedPane === "prompt"
                  ? "Prompt"
                  : expandedPane === "story"
                    ? "Stories"
                    : expandedPane === "design"
                      ? "Design"
                      : expandedPane === "code"
                        ? "Code"
                        : "Tests"}
              </h2>
              <div className="workspace-col-head-actions">
                {expandedPane === "test" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !project || !canEditStage("test", session)}
                      onClick={() => void addTestScenario()}
                    >
                      + Add test
                    </button>
                    {renderTestBulkBar()}
                  </>
                ) : null}
                <button type="button" onClick={() => setExpandedPane(null)}>
                  Collapse
                </button>
              </div>
            </div>
            <div className="workspace-pane-modal-body">
              {expandedPane === "prompt" ? (
                <>
                  <textarea
                    className="workspace-prompt"
                    style={{ minHeight: "12rem" }}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Enter a product prompt…"
                    disabled={busy || !canEditStage("story", session)}
                  />
                  <div className="toolbar">
                    <button
                      type="button"
                      disabled={busy || !prompt.trim() || !project || !canEditStage("story", session)}
                      onClick={() => void runPrompt()}
                    >
                      {busy ? "Working…" : "Create stories"}
                    </button>
                  </div>
                </>
              ) : null}
              {expandedPane === "story" ? (
                <div className="workspace-scroll">
                  {filteredStories.map((row) => renderArtifactCard(row, "story"))}
                  {filteredStories.length === 0 ? <p className="muted">No stories match.</p> : null}
                </div>
              ) : null}
              {expandedPane === "design" ? (
                <div className="workspace-scroll">
                  {filteredDesigns.map((row) => renderArtifactCard(row, "design"))}
                  {filteredDesigns.length === 0 ? <p className="muted">No designs match.</p> : null}
                </div>
              ) : null}
              {expandedPane === "code" ? (
                <div className="workspace-scroll">
                  {filteredCodes.map((row) => renderArtifactCard(row, "code"))}
                  {filteredCodes.length === 0 ? <p className="muted">No code matches.</p> : null}
                </div>
              ) : null}
              {expandedPane === "test" ? (
                <div className="workspace-scroll">
                  {filteredTests.map((row) => renderArtifactCard(row, "test"))}
                  {filteredTests.length === 0 ? <p className="muted">No tests match.</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activityOpen ? (
        <div className="modal-backdrop" onClick={() => setActivityOpen(false)}>
          <div className="modal-panel activity-modal" onClick={(event) => event.stopPropagation()}>
            <div className="workspace-col-head">
              <h2 style={{ margin: 0 }}>Activity</h2>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <button type="button" onClick={() => void refreshAudit()}>
                  Refresh
                </button>
                <button type="button" onClick={() => setActivityOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="workspace-scroll workspace-log">
              {logs.length === 0 ? (
                <p className="muted">No activity yet.</p>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
