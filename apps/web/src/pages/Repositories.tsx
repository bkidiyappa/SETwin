import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, getToken, onTokenChange } from "../api";

type Repository = {
  id: string;
  path: string;
  remoteUrl: string;
  defaultBranch: string;
  lastIndexedAt: string | null;
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
};

export function RepositoriesPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("orderdemo");
  const [newProjectName, setNewProjectName] = useState("Order Demo");
  const [path, setPath] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!getToken()) {
      setRepos([]);
      setProjects([]);
      setError("Sign in on the Dashboard first.");
      return;
    }
    setError("");
    try {
      const [repoRows, projectRows] = await Promise.all([
        apiGet<Repository[]>("/repos"),
        apiGet<Project[]>("/projects"),
      ]);
      setRepos(repoRows);
      setProjects(projectRows);
      setProject((current) => {
        if (projectRows.some((row) => row.key === current)) {
          return current;
        }
        return projectRows[0]?.key ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    return onTokenChange(() => {
      void load();
    });
  }, [load]);

  async function createProject(): Promise<void> {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const key = newProjectKey.trim().toLowerCase();
      const created = await apiPost<Project>("/projects", {
        key,
        name: newProjectName.trim() || key,
      });
      setMessage(`Created project ${created.key}`);
      setProject(created.key);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function register(): Promise<void> {
    if (!project) {
      setError("Create or select a SETwin project first.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const row = await apiPost<Repository>("/repos", { project, path });
      setMessage(`Registered ${row.path} (${row.defaultBranch})`);
      setPath("");
      await load();
      setSelectedId(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function indexRepo(id: string): Promise<void> {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await apiPost<{ symbols: number; edges: number }>(`/repos/${id}/index`, {});
      setMessage(`Indexed symbols=${result.symbols} edges=${result.edges}`);
      await load();
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
      <h1>Repositories</h1>
      <p>
        Point SETwin at a local git clone of your product. First create a SETwin <strong>project</strong>, then register
        the repo path and index it.
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
        <h2>1. SETwin project</h2>
        <p className="muted">
          A twin project is required before registering a repo. This is not the git folder name — it is SETwin’s project
          key (for example <code>orderdemo</code>).
        </p>
        {projects.length > 0 ? (
          <div className="toolbar">
            <select value={project} onChange={(event) => setProject(event.target.value)}>
              {projects.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.key} — {row.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="muted">No projects yet. Create one below.</p>
        )}
        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <input
            value={newProjectKey}
            onChange={(event) => setNewProjectKey(event.target.value)}
            placeholder="project key"
          />
          <input
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="display name"
          />
          <button type="button" disabled={busy || !newProjectKey.trim()} onClick={() => void createProject()}>
            Create project
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>2. Register a product repository</h2>
        <p className="muted">
          Absolute path to a local git checkout the API can read, for example{" "}
          <code>C:\Users\Basavaraju Kidiyappa\OrderDemo</code>.
        </p>
        <div className="toolbar">
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? <option value="">No project</option> : null}
            {projects.map((row) => (
              <option key={row.key} value={row.key}>
                {row.key}
              </option>
            ))}
          </select>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Absolute path to local git repo"
            style={{ minWidth: "320px", flex: 1 }}
          />
          <button type="button" disabled={busy || !path.trim() || !project} onClick={() => void register()}>
            Register
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>Registered repositories</h2>
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
                <td className="muted">{row.lastIndexedAt ? new Date(row.lastIndexedAt).toLocaleString() : "never"}</td>
                <td>
                  <div className="toolbar">
                    <button type="button" disabled={busy} onClick={() => void indexRepo(row.id)}>
                      Index
                    </button>
                    <button type="button" disabled={busy} onClick={() => void showSymbols(row.id)}>
                      Symbols
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {repos.length === 0 && !error ? (
          <p className="muted">No repositories yet. Create a project, then register a path above.</p>
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
