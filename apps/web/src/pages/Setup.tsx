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
  projectKey?: string;
};

type SymbolRow = {
  id: string;
  filePath: string;
  language: string;
  kind: string;
  name: string;
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
  const [selectedId, setSelectedId] = useState("");
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    setSelectedId("");
    setSymbols([]);
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
      setSelectedId(row.id);
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
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await apiPost<{ symbols: number; edges: number }>(`/repos/${id}/index`, {});
      setMessage(`Indexed symbols=${result.symbols} edges=${result.edges}`);
      await loadRepos(project);
      const rows = await apiGet<SymbolRow[]>(`/repos/${id}/symbols`);
      setSelectedId(id);
      setSymbols(rows.slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function showSymbols(id: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const rows = await apiGet<SymbolRow[]>(`/repos/${id}/symbols`);
      setSelectedId(id);
      setSymbols(rows.slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
                  </td>
                  <td>
                    <div className="toolbar">
                      {isAdmin ? (
                        <button type="button" disabled={busy} onClick={() => void indexRepo(row.id)}>
                          Index
                        </button>
                      ) : null}
                      <button type="button" disabled={busy} onClick={() => void showSymbols(row.id)}>
                        Symbols
                      </button>
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

      {selectedId ? (
        <div className="panel">
          <h2>Symbols {symbols.length > 0 ? `(showing ${symbols.length})` : ""}</h2>
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Name</th>
                <th>Language</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind}</td>
                  <td>{row.name}</td>
                  <td>{row.language}</td>
                  <td>
                    <code>{row.filePath}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {symbols.length === 0 ? <p className="muted">Index this repository to populate symbols.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
