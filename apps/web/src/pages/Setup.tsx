import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  getSessionUser,
  getToken,
  hasRole,
  onTokenChange,
  refreshSession,
  type SessionUser,
} from "../api";

type Repository = {
  id: string;
  path: string;
  remoteUrl: string;
  defaultBranch: string;
  lastIndexedAt: string | null;
  indexedCommit?: string;
  indexedBranch?: string;
  projectKey?: string;
};

type Project = {
  key: string;
  name: string;
  description?: string;
  techStack?: string;
};

type Feature = {
  key: string;
  type: string;
  currentVersion: { title: string; content: string; workflowState: string; version: number };
};

const DEFAULT_TECH_STACK = [
  "language: TypeScript",
  "runtime: Node.js",
  "framework: React",
  "packageManager: pnpm",
  "testFramework: vitest",
  "notes: Prefer src/ for production code; tests under tst/unit and tst/int/{api,ui} (follow existing layout if present)",
].join("\n");

function ProductSelect({
  projects,
  value,
  onChange,
  disabled,
}: {
  projects: Project[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <label className="workspace-filter-field" style={{ marginBottom: "0.75rem" }}>
      <span className="muted">Product</span>
      <select
        value={value}
        disabled={disabled || projects.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {projects.length === 0 ? <option value="">No products yet — create one in section 1</option> : null}
        {projects.map((row) => (
          <option key={row.key} value={row.key}>
            {row.key} — {row.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SetupPage() {
  const [session, setSession] = useState<SessionUser | null>(getSessionUser());
  const [repos, setRepos] = useState<Repository[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [project, setProject] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [techStackDraft, setTechStackDraft] = useState(DEFAULT_TECH_STACK);
  const [featureTitle, setFeatureTitle] = useState("");
  const [featureContent, setFeatureContent] = useState("");
  const [editingKey, setEditingKey] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [indexing, setIndexing] = useState<Record<string, string>>({});

  const isAdmin = hasRole("administrator", session);

  const loadFeatures = useCallback(async (projectKey: string) => {
    if (!projectKey || !getToken()) {
      setFeatures([]);
      return;
    }
    try {
      const rows = await apiGet<Feature[]>(`/features?project=${encodeURIComponent(projectKey)}`);
      setFeatures(rows);
    } catch {
      setFeatures([]);
    }
  }, []);

  const loadRepos = useCallback(async (projectKey: string) => {
    if (!getToken()) {
      setRepos([]);
      return;
    }
    try {
      const query = projectKey ? `?project=${encodeURIComponent(projectKey)}` : "";
      const rows = await apiGet<Repository[]>(`/repos${query}`);
      setRepos(rows);
    } catch {
      setRepos([]);
    }
  }, []);

  const loadProjects = useCallback(async (): Promise<Project[]> => {
    if (!getToken()) {
      setProjects([]);
      setError("Sign in on the Dashboard first.");
      return [];
    }
    setError("");
    try {
      const projectRows = await apiGet<Project[]>("/projects");
      const sorted = [...projectRows].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      setProjects(sorted);
      setProject((current) => {
        if (current && sorted.some((row) => row.key === current)) {
          return current;
        }
        return sorted[0]?.key ?? "";
      });
      return sorted;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
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
    })();
    return onTokenChange(() => {
      setSession(getSessionUser());
      void loadProjects();
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!project) {
      setFeatures([]);
      setRepos([]);
      setTechStackDraft(DEFAULT_TECH_STACK);
      return;
    }
    void loadFeatures(project);
    void loadRepos(project);
    const selected = projects.find((row) => row.key === project);
    setTechStackDraft(selected?.techStack?.trim() || DEFAULT_TECH_STACK);
    setEditingKey("");
  }, [project, projects, loadFeatures, loadRepos]);

  async function createProject(): Promise<void> {
    if (!isAdmin) {
      setError("Only administrators can change Setup.");
      return;
    }
    const key = newProjectKey.trim().toLowerCase();
    if (!key) {
      setError("Project key is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const created = await apiPost<Project>("/projects", {
        key,
        name: newProjectName.trim() || key,
        techStack: DEFAULT_TECH_STACK,
      });
      setMessage(`Created product ${created.key}`);
      setNewProjectKey("");
      setNewProjectName("");
      const rows = await loadProjects();
      setProject(created.key);
      if (!rows.some((row) => row.key === created.key)) {
        setProjects((prev) =>
          [...prev, created].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
        );
        setProject(created.key);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveTechStack(): Promise<void> {
    if (!isAdmin) {
      setError("Only administrators can change Setup.");
      return;
    }
    if (!project) {
      setError("Select a product first.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const updated = await apiPatch<Project>(`/projects/${project}`, {
        techStack: techStackDraft.trim(),
      });
      setMessage(`Saved tech stack for ${updated.key}`);
      setProjects((prev) => prev.map((row) => (row.key === updated.key ? { ...row, ...updated } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createFeature(): Promise<void> {
    if (!isAdmin) {
      setError("Only administrators can create features.");
      return;
    }
    if (!project) {
      setError("Select a product first.");
      return;
    }
    if (!featureTitle.trim()) {
      setError("Feature title is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const created = await apiPost<Feature>("/features", {
        project,
        title: featureTitle.trim(),
        content: featureContent.trim() || featureTitle.trim(),
      });
      setMessage(`Created feature ${created.key} for ${project}`);
      setFeatureTitle("");
      setFeatureContent("");
      await loadFeatures(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveFeatureEdit(): Promise<void> {
    if (!isAdmin || !editingKey) {
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const updated = await apiPatch<Feature>(`/features/${editingKey}`, {
        title: editTitle.trim(),
        content: editContent,
      });
      setMessage(`Updated ${updated.key} v${updated.currentVersion.version}`);
      setEditingKey("");
      await loadFeatures(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function softDeleteFeature(key: string): Promise<void> {
    if (!isAdmin) {
      return;
    }
    if (!window.confirm(`Soft-delete feature ${key}? It will be hidden but the key is kept.`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await apiDelete(`/features/${key}`);
      setMessage(`Soft-deleted ${key}`);
      if (editingKey === key) {
        setEditingKey("");
      }
      await loadFeatures(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function register(): Promise<void> {
    if (!isAdmin) {
      setError("Only administrators can change Setup.");
      return;
    }
    if (!project) {
      setError("Select a product first.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const row = await apiPost<Repository>("/repos", { project, path });
      setMessage(`Registered ${row.path} for ${project}`);
      setPath("");
      await loadRepos(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function indexRepo(id: string): Promise<void> {
    if (!isAdmin) {
      setError("Only administrators can index repositories.");
      return;
    }
    setMessage("");
    setError("");
    setIndexing((current) => ({ ...current, [id]: "Starting index…" }));
    const timer = window.setInterval(() => {
      void apiGet<{
        status: string;
        filesDone: number;
        filesTotal: number;
        symbols: number;
        edges: number;
        commit: string;
        message: string;
      }>(`/repos/${id}/index-progress`).then((progress) => {
        if (progress.status === "idle") {
          return;
        }
        const commit = progress.commit ? ` · ${progress.commit.slice(0, 7)}` : "";
        setIndexing((current) => ({
          ...current,
          [id]: `${progress.message || progress.status} · ${progress.filesDone}/${progress.filesTotal} files · ${progress.symbols} symbols · ${progress.edges} edges${commit}`,
        }));
      });
    }, 1000);
    try {
      const result = await apiPost<{ symbols: number; edges: number; files: number; commit: string }>(`/repos/${id}/index`, {});
      setMessage(`Indexed ${result.files} files, ${result.symbols} symbols, ${result.edges} edges at ${result.commit.slice(0, 7)}`);
      await loadRepos(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.clearInterval(timer);
      setIndexing((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <div>
      <h1>Setup</h1>
      <p>
        Product twin configuration: projects, tech stack, features, and repositories.{" "}
        {isAdmin ? (
          <span className="muted">You can create, edit, and soft-delete as administrator.</span>
        ) : (
          <span className="muted">Read-only for your role — only administrators can change Setup.</span>
        )}
      </p>

      {error ? (
        <p className="error">
          {error}{" "}
          {!getToken() ? (
            <Link to="/" style={{ color: "inherit", textDecoration: "underline" }}>
              Go to Dashboard
            </Link>
          ) : null}
        </p>
      ) : null}
      {message ? <p>{message}</p> : null}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>1. Project / product</h2>
        <p className="muted">Create products here. They appear in the list below and in sections 2–4.</p>
        {isAdmin ? (
          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <input
              value={newProjectKey}
              onChange={(event) => setNewProjectKey(event.target.value)}
              placeholder="product key (e.g. orderdemo)"
            />
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="display name"
            />
            <button type="button" disabled={busy || !newProjectKey.trim()} onClick={() => void createProject()}>
              Create product
            </button>
            <button type="button" disabled={busy} onClick={() => void loadProjects()}>
              Refresh
            </button>
          </div>
        ) : (
          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <button type="button" disabled={busy} onClick={() => void loadProjects()}>
              Refresh
            </button>
          </div>
        )}
        {projects.length === 0 ? (
          <p className="muted">No products yet. Create one above to continue.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Tech stack</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((row) => (
                <tr key={row.key} className={row.key === project ? "setup-row-active" : undefined}>
                  <td>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => setProject(row.key)}
                      title="Select this product for sections 2–4"
                    >
                      <code>{row.key}</code>
                    </button>
                  </td>
                  <td>{row.name}</td>
                  <td className="muted" style={{ maxWidth: "18rem", whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
                    {row.techStack?.trim()
                      ? row.techStack.trim().split(/\r?\n/).slice(0, 2).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>2. Tech stack</h2>
        <p className="muted">
          Defaults for the coding agent on the selected product. Repo detection wins when the repo already has signals
          (e.g. <code>package.json</code>); empty repos use this configuration.
        </p>
        <ProductSelect projects={projects} value={project} onChange={setProject} disabled={busy} />
        <textarea
          className="workspace-prompt"
          style={{ minHeight: "8rem", width: "100%" }}
          value={techStackDraft}
          onChange={(event) => setTechStackDraft(event.target.value)}
          placeholder={"language: TypeScript\nframework: React\npackageManager: pnpm\ntestFramework: vitest"}
          disabled={busy || !project || !isAdmin}
        />
        {isAdmin ? (
          <div className="toolbar" style={{ marginTop: "0.5rem" }}>
            <button type="button" disabled={busy || !project} onClick={() => void saveTechStack()}>
              Save tech stack
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>3. Features</h2>
        <p className="muted">
          Select a product, then create features for it. Stories in Workspace attach to these features before submit.
        </p>
        <ProductSelect projects={projects} value={project} onChange={setProject} disabled={busy} />
        {isAdmin ? (
          <>
            <div className="toolbar">
              <input
                value={featureTitle}
                onChange={(event) => setFeatureTitle(event.target.value)}
                placeholder="Feature title"
                style={{ minWidth: "220px", flex: 1 }}
                disabled={!project}
              />
              <button
                type="button"
                disabled={busy || !project || !featureTitle.trim()}
                onClick={() => void createFeature()}
              >
                Create feature
              </button>
            </div>
            <textarea
              className="workspace-prompt"
              style={{ minHeight: "4.5rem", width: "100%", marginTop: "0.5rem" }}
              value={featureContent}
              onChange={(event) => setFeatureContent(event.target.value)}
              placeholder="Optional feature description / scope…"
              disabled={busy || !project}
            />
          </>
        ) : null}
        {!project ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Select a product to view its features.
          </p>
        ) : features.length === 0 ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            No features yet for <code>{project}</code>.
          </p>
        ) : (
          <table style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>State</th>
                {isAdmin ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {[...features]
                .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
                .map((row) => (
                  <tr key={row.key}>
                    <td>
                      <code>{row.key}</code>
                    </td>
                    <td>
                      {editingKey === row.key ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                          <textarea
                            value={editContent}
                            onChange={(event) => setEditContent(event.target.value)}
                            style={{ minHeight: "4rem" }}
                          />
                        </div>
                      ) : (
                        row.currentVersion.title
                      )}
                    </td>
                    <td className="muted">{row.currentVersion.workflowState}</td>
                    {isAdmin ? (
                      <td>
                        <div className="toolbar" style={{ marginBottom: 0 }}>
                          {editingKey === row.key ? (
                            <>
                              <button type="button" disabled={busy} onClick={() => void saveFeatureEdit()}>
                                Save
                              </button>
                              <button type="button" disabled={busy} onClick={() => setEditingKey("")}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingKey(row.key);
                                  setEditTitle(row.currentVersion.title);
                                  setEditContent(row.currentVersion.content);
                                }}
                              >
                                Edit
                              </button>
                              <button type="button" disabled={busy} onClick={() => void softDeleteFeature(row.key)}>
                                Soft delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>4. Register a product repository</h2>
        <p className="muted">Select a product, then register an absolute path to a local git checkout.</p>
        <ProductSelect projects={projects} value={project} onChange={setProject} disabled={busy} />
        {isAdmin ? (
          <div className="toolbar">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="Absolute path to local git repo"
              style={{ minWidth: "320px", flex: 1 }}
              disabled={!project}
            />
            <button type="button" disabled={busy || !path.trim() || !project} onClick={() => void register()}>
              Register
            </button>
          </div>
        ) : (
          <p className="muted">Repository registration is administrator-only.</p>
        )}

        <h3 style={{ marginTop: "1rem", fontSize: "1rem" }}>
          Repositories{project ? ` for ${project}` : ""}
        </h3>
        {!project ? (
          <p className="muted">Select a product to view its repositories.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Remote</th>
                <th>Branch</th>
                <th>Last indexed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code>{row.path}</code>
                  </td>
                  <td className="muted">{row.remoteUrl || "—"}</td>
                  <td>{row.defaultBranch}</td>
                  <td className="muted">
                    {row.lastIndexedAt ? new Date(row.lastIndexedAt).toLocaleString() : "never"}
                    {row.indexedCommit ? <div>{row.indexedCommit.slice(0, 7)}{row.indexedBranch ? ` · ${row.indexedBranch}` : ""}</div> : null}
                    {indexing[row.id] ? <div>{indexing[row.id]}</div> : null}
                  </td>
                  <td>
                    <div className="toolbar">
                      {isAdmin ? (
                        <button type="button" disabled={Boolean(indexing[row.id])} onClick={() => void indexRepo(row.id)}>
                          Index
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {project && repos.length === 0 && !error ? (
          <p className="muted">No repositories registered for this product yet.</p>
        ) : null}
      </div>

      <AgentModels isAdmin={isAdmin} />
      <RoleAgentSkills isAdmin={isAdmin} />
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Local (Ollama)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  bedrock: "Amazon Bedrock",
  azure: "Azure OpenAI",
  gemini: "Gemini",
};

const MODEL_HINTS: Record<string, string> = {
  requirements: "gpt-4o",
  architecture: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  coding: "qwen2.5:7b",
  tests: "amazon.nova-pro-v1:0",
};

function AgentModels({ isAdmin }: { isAdmin: boolean }) {
  const [agents, setAgents] = useState<Array<{ id: string; label: string; hint: string }>>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Array<{ agent: string; provider: string; model: string }>>([]);
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin || !getToken()) {
      return;
    }
    let cancelled = false;
    void apiGet<{
      agents: Array<{ id: string; label: string; hint: string }>;
      providers: string[];
      routes: Array<{ agent: string; provider: string; model: string }>;
    }>("/llm/routes")
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAgents(payload.agents);
        setProviders(payload.providers);
        setRoutes(payload.routes);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLocalError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function patchRoute(agent: string, patch: Partial<{ provider: string; model: string }>): void {
    setRoutes((current) => current.map((row) => (row.agent === agent ? { ...row, ...patch } : row)));
  }

  async function saveRoutes(): Promise<void> {
    setSaving(true);
    setLocalError("");
    setLocalMessage("");
    try {
      const saved = await apiPost<{ routes: Array<{ agent: string; provider: string; model: string }> }>("/llm/routes", {
        routes,
      });
      setRoutes(saved.routes);
      setLocalMessage("Agent models saved.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <h2>Agent models</h2>
      <p className="muted">
        Each agent can use the same model or a different one. Requirements can use OpenAI, architecture a Bedrock Claude
        model, coding a local Ollama model, and tests a Bedrock Nova model. Leave an agent on Default chain to follow
        the Default row, or the built-in order when Default is empty. API keys and endpoints stay in the environment.
      </p>
      {localError ? <p className="error">{localError}</p> : null}
      {localMessage ? <p>{localMessage}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Provider</th>
            <th>Model</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((row) => {
            const meta = agents.find((agent) => agent.id === row.agent);
            return (
              <tr key={row.agent}>
                <td>
                  {meta?.label ?? row.agent}
                  {meta?.hint ? <div className="muted">{meta.hint}</div> : null}
                </td>
                <td>
                  <select value={row.provider} onChange={(event) => patchRoute(row.agent, { provider: event.target.value })}>
                    <option value="">Default chain</option>
                    {providers.map((provider) => (
                      <option key={provider} value={provider}>
                        {PROVIDER_LABELS[provider] ?? provider}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={row.model}
                    placeholder={MODEL_HINTS[row.agent] ?? "provider default"}
                    onChange={(event) => patchRoute(row.agent, { model: event.target.value })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: "0.75rem" }}>
        <button type="button" disabled={saving || routes.length === 0} onClick={() => void saveRoutes()}>
          Save agent models
        </button>
      </div>
    </div>
  );
}

type RoleSkillRow = {
  role: string;
  displayName: string;
  mission: string;
  skills: string[];
  guardrails: string[];
};

function RoleAgentSkills({ isAdmin }: { isAdmin: boolean }) {
  const [skills, setSkills] = useState<RoleSkillRow[]>([]);
  const [openRole, setOpenRole] = useState("");
  const [openName, setOpenName] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [localError, setLocalError] = useState("");
  const [modalError, setModalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await apiGet<RoleSkillRow[]>("/agents/skills");
    setSkills([...rows].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    let cancelled = false;
    void load().catch((err: unknown) => {
      if (!cancelled) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function closeEditor(): void {
    setOpenRole("");
    setOpenName("");
    setMarkdown("");
    setModalError("");
  }

  async function edit(row: RoleSkillRow): Promise<void> {
    setBusy(true);
    setLocalError("");
    setModalError("");
    setLocalMessage("");
    try {
      const loaded = await apiGet<{ markdown: string }>(`/agents/skills/${encodeURIComponent(row.role)}/markdown`);
      setOpenRole(row.role);
      setOpenName(row.displayName);
      setMarkdown(loaded.markdown);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!openRole) {
      return;
    }
    setBusy(true);
    setModalError("");
    setLocalMessage("");
    try {
      await apiPost(`/agents/skills/${encodeURIComponent(openRole)}/markdown`, { markdown });
      await apiPost("/agents/skills/reload", {});
      await load();
      closeEditor();
      setLocalMessage("Skill saved. Memory refreshed from the markdown.");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshMemory(role: string): Promise<void> {
    setBusy(true);
    setLocalError("");
    setLocalMessage("");
    try {
      await apiPost("/agents/skills/reload", {});
      await load();
      if (openRole === role) {
        const row = await apiGet<{ markdown: string }>(`/agents/skills/${encodeURIComponent(role)}/markdown`);
        setMarkdown(row.markdown);
      }
      setLocalMessage("Memory refreshed. Skills, constraints, and guardrails were reloaded from markdown.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <h2>Agent skills</h2>
      <p className="muted">
        Each agent reads its mission, skills, constraints, and guardrails from markdown. Edit saves the file and reloads
        it. Refresh memory reloads the files without restarting. A restart loads the same files.
      </p>
      {localError ? <p className="error">{localError}</p> : null}
      {localMessage ? <p>{localMessage}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Loaded from markdown</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {skills.map((row) => (
            <tr key={row.role}>
              <td>
                {row.displayName}
                <div className="muted">{row.mission}</div>
              </td>
              <td>
                <div>{row.skills.length} skills</div>
                <div className="muted">{row.guardrails.length} guardrails</div>
              </td>
              <td>
                <div className="toolbar">
                  <button type="button" disabled={busy || !isAdmin} onClick={() => void edit(row)}>
                    Edit
                  </button>
                  <button type="button" disabled={busy || !isAdmin} onClick={() => void refreshMemory(row.role)}>
                    Refresh memory
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {openRole ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && closeEditor()}>
          <div
            className="modal-panel skill-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${openName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>{openName}</h2>
            <p className="muted">{openRole}.md</p>
            {modalError ? <p className="error">{modalError}</p> : null}
            <textarea
              className="workspace-prompt"
              value={markdown}
              disabled={busy || !isAdmin}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            <div className="toolbar" style={{ marginTop: "0.75rem" }}>
              <button type="button" disabled={busy || !isAdmin} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" disabled={busy} onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
