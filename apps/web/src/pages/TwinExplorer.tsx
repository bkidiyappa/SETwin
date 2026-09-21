import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent, type WheelEvent } from "react";
import { Link } from "react-router-dom";
import {
  apiGet,
  getSessionUser,
  getToken,
  onTokenChange,
  refreshSession,
  type SessionUser,
} from "../api";

type Project = { key: string; name: string };

type Artifact = {
  key: string;
  type: string;
  projectKey: string;
  currentVersion: { version: number; title: string; content: string; workflowState: string };
};

type Edge = { from: string; to: string; type: string };

type PipelineStatus = {
  project: string;
  stages: Array<{ artifacts: Artifact[] }>;
  relationships: Edge[];
};

type SimNode = {
  key: string;
  title: string;
  type: string;
  state: string;
  category: "requirement" | "code" | "test" | "other";
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
};

type ExpandPane = "requirements" | "code" | "tests" | "graph" | null;

const CATEGORY_COLOR = {
  requirement: "#e4572e",
  code: "#f3c623",
  test: "#2a9d8f",
  other: "#6ea8fe",
} as const;

const REQUIREMENT_TYPES = new Set(["STORY", "REQUIREMENT", "FEATURE", "EPIC"]);
const CODE_TYPES = new Set(["CODE", "DESIGN", "ARCHITECTURE", "COMPONENT"]);
const TEST_TYPES = new Set(["TEST", "GHERKIN"]);

function categoryOf(type: string): SimNode["category"] {
  if (REQUIREMENT_TYPES.has(type)) {
    return "requirement";
  }
  if (CODE_TYPES.has(type)) {
    return "code";
  }
  if (TEST_TYPES.has(type)) {
    return "test";
  }
  return "other";
}

function collectConnected(startKey: string, allEdges: Edge[]): Set<string> {
  const keys = new Set<string>([startKey.toUpperCase()]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of allEdges) {
      const from = edge.from.toUpperCase();
      const to = edge.to.toUpperCase();
      if (keys.has(from) && !keys.has(to)) {
        keys.add(to);
        grew = true;
      } else if (keys.has(to) && !keys.has(from)) {
        keys.add(from);
        grew = true;
      }
    }
  }
  return keys;
}

function matchesQuery(row: Artifact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    row.key.toLowerCase().includes(q) ||
    row.type.toLowerCase().includes(q) ||
    row.currentVersion.title.toLowerCase().includes(q) ||
    row.currentVersion.content.toLowerCase().includes(q) ||
    row.currentVersion.workflowState.toLowerCase().includes(q)
  );
}

function layoutForce(
  artifacts: Artifact[],
  edges: Edge[],
  width: number,
  height: number,
): SimNode[] {
  if (!artifacts.length) {
    return [];
  }
  const degree = new Map<string, number>();
  for (const row of artifacts) {
    degree.set(row.key, 0);
  }
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const nodes: SimNode[] = artifacts.map((row, index) => {
    const angle = (index / artifacts.length) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.32;
    return {
      key: row.key,
      title: row.currentVersion.title,
      type: row.type,
      state: row.currentVersion.workflowState,
      category: categoryOf(row.type),
      x: width / 2 + Math.cos(angle) * radius * (0.55 + (index % 5) * 0.09),
      y: height / 2 + Math.sin(angle) * radius * (0.55 + (index % 7) * 0.07),
      vx: 0,
      vy: 0,
      degree: degree.get(row.key) ?? 0,
    };
  });

  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const links = edges
    .map((edge) => ({
      source: byKey.get(edge.from.toUpperCase()) ?? byKey.get(edge.from),
      target: byKey.get(edge.to.toUpperCase()) ?? byKey.get(edge.to),
      type: edge.type,
    }))
    .filter((link) => link.source && link.target) as Array<{
    source: SimNode;
    target: SimNode;
    type: string;
  }>;

  for (let step = 0; step < 80; step++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minDist = 48;
        if (dist < minDist) {
          const force = ((minDist - dist) / dist) * 0.35;
          dx *= force;
          dy *= force;
          a.vx -= dx;
          a.vy -= dy;
          b.vx += dx;
          b.vy += dy;
        } else {
          const force = 18 / (dist * dist);
          dx *= force;
          dy *= force;
          a.vx -= dx;
          a.vy -= dy;
          b.vx += dx;
          b.vy += dy;
        }
      }
    }
    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = ((dist - 110) / dist) * 0.04;
      link.source.vx += dx * force;
      link.source.vy += dy * force;
      link.target.vx -= dx * force;
      link.target.vy -= dy * force;
    }
    for (const node of nodes) {
      node.vx += (width / 2 - node.x) * 0.008;
      node.vy += (height / 2 - node.y) * 0.008;
      node.vx *= 0.84;
      node.vy *= 0.84;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(36, Math.min(width - 36, node.x));
      node.y = Math.max(36, Math.min(height - 36, node.y));
    }
  }
  return nodes;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max - 1)}…`;
}

export function TwinExplorerPage() {
  const [session, setSession] = useState<SessionUser | null>(getSessionUser());
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [reqQuery, setReqQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState<ExpandPane>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; panX: number; panY: number }>({
    active: false,
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const graphWrapRef = useRef<HTMLDivElement | null>(null);

  const loadProjects = useCallback(async () => {
    if (!getToken()) {
      setError("Sign in on the Dashboard first.");
      setPipeline(null);
      return;
    }
    setError("");
    try {
      const me = await refreshSession();
      setSession(me);
      const projectRows = await apiGet<Project[]>("/projects");
      setProjects(projectRows);
      setProject((current) =>
        projectRows.some((row) => row.key === current) ? current : projectRows[0]?.key ?? "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    return onTokenChange(() => {
      setSession(getSessionUser());
      void loadProjects();
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!project || !getToken()) {
      setPipeline(null);
      return;
    }
    void (async () => {
      try {
        const status = await apiGet<PipelineStatus>(`/pipeline/${project}`);
        setPipeline(status);
        setSelectedKey("");
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [project]);

  const allArtifacts = useMemo(
    () => pipeline?.stages.flatMap((stage) => stage.artifacts) ?? [],
    [pipeline],
  );
  const allEdges = useMemo(() => pipeline?.relationships ?? [], [pipeline]);
  const byKey = useMemo(() => new Map(allArtifacts.map((row) => [row.key, row])), [allArtifacts]);

  const connectedKeys = useMemo(() => {
    if (!selectedKey) {
      return null;
    }
    return collectConnected(selectedKey, allEdges);
  }, [selectedKey, allEdges]);

  const requirementsAll = useMemo(
    () => allArtifacts.filter((row) => REQUIREMENT_TYPES.has(row.type)),
    [allArtifacts],
  );
  const codeAll = useMemo(
    () => allArtifacts.filter((row) => CODE_TYPES.has(row.type)),
    [allArtifacts],
  );
  const testsAll = useMemo(
    () => allArtifacts.filter((row) => TEST_TYPES.has(row.type)),
    [allArtifacts],
  );

  const relatedRequirements = useMemo(() => {
    const base = connectedKeys
      ? requirementsAll.filter((row) => connectedKeys.has(row.key))
      : requirementsAll;
    return base.filter((row) => matchesQuery(row, reqQuery));
  }, [requirementsAll, connectedKeys, reqQuery]);

  const relatedCode = useMemo(() => {
    const base = connectedKeys ? codeAll.filter((row) => connectedKeys.has(row.key)) : codeAll;
    return base.filter((row) => matchesQuery(row, codeQuery));
  }, [codeAll, connectedKeys, codeQuery]);

  const relatedTests = useMemo(() => {
    const base = connectedKeys ? testsAll.filter((row) => connectedKeys.has(row.key)) : testsAll;
    return base.filter((row) => matchesQuery(row, testQuery));
  }, [testsAll, connectedKeys, testQuery]);

  const graphWidth = 900;
  const graphHeight = 420;
  const nodes = useMemo(
    () => layoutForce(allArtifacts, allEdges, graphWidth, graphHeight),
    [allArtifacts, allEdges],
  );

  const visibleEdges = useMemo(() => {
    if (!connectedKeys) {
      return allEdges;
    }
    return allEdges.filter(
      (edge) => connectedKeys.has(edge.from.toUpperCase()) && connectedKeys.has(edge.to.toUpperCase()),
    );
  }, [allEdges, connectedKeys]);

  function selectArtifact(key: string): void {
    setSelectedKey(key);
  }

  function clampZoom(value: number): number {
    return Math.min(3.5, Math.max(0.35, value));
  }

  function zoomBy(factor: number): void {
    setZoom((current) => clampZoom(current * factor));
  }

  function onWheel(event: WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom((current) => clampZoom(current * factor));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current.active) {
      return;
    }
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }

  function onPointerUp(): void {
    dragRef.current.active = false;
  }

  /** Zoomed in (larger zoom) shows richer labels. */
  const showTitles = zoom >= 1.15;
  const showDetails = zoom >= 1.65;

  function renderGraphSvg(height = graphHeight): ReactNode {
    if (nodes.length === 0) {
      return (
        <p className="muted">
          No artifacts for this product. Create stories in <Link to="/workspace">Workspace</Link>.
        </p>
      );
    }
    const cx = graphWidth / 2;
    const cy = height / 2;
    return (
      <div
        ref={graphWrapRef}
        className="twin-graph-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          viewBox={`0 0 ${graphWidth} ${height}`}
          className="twin-graph twin-graph-network"
          role="img"
          aria-label="Product twin network graph"
        >
          <rect x={0} y={0} width={graphWidth} height={height} fill="#f4f6f8" rx={8} />
          <g transform={`translate(${pan.x + cx * (1 - zoom)}, ${pan.y + cy * (1 - zoom)}) scale(${zoom})`}>
            {visibleEdges.map((edge) => {
              const from = nodes.find((node) => node.key === edge.from.toUpperCase() || node.key === edge.from);
              const to = nodes.find((node) => node.key === edge.to.toUpperCase() || node.key === edge.to);
              if (!from || !to) {
                return null;
              }
              const dimmed =
                connectedKeys && (!connectedKeys.has(from.key) || !connectedKeys.has(to.key));
              return (
                <line
                  key={`${edge.from}-${edge.type}-${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={dimmed ? "twin-edge twin-edge-dim" : "twin-edge twin-edge-light"}
                />
              );
            })}
            {nodes.map((node) => {
              const inFocus = !connectedKeys || connectedKeys.has(node.key);
              const isSelected = node.key === selectedKey;
              const radius = Math.min(28, 10 + Math.sqrt(node.degree + 1) * 4) + (isSelected ? 4 : 0);
              return (
                <g
                  key={node.key}
                  opacity={inFocus ? 1 : 0.18}
                  onClick={() => selectArtifact(node.key)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={CATEGORY_COLOR[node.category]}
                    stroke={isSelected ? "#1a1a1a" : "#fff"}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  <text x={node.x} y={node.y - radius - (showTitles ? 18 : 6)} textAnchor="middle" className="twin-network-label">
                    {node.key}
                  </text>
                  {showTitles ? (
                    <text
                      x={node.x}
                      y={node.y - radius - 4}
                      textAnchor="middle"
                      className="twin-network-title"
                    >
                      {truncate(node.title || node.type, showDetails ? 42 : 28)}
                    </text>
                  ) : null}
                  {showDetails ? (
                    <text x={node.x} y={node.y + radius + 12} textAnchor="middle" className="twin-network-meta">
                      {node.type} · {node.state}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    );
  }

  function renderCardList(rows: Artifact[], emptyHint: string): ReactNode {
    if (rows.length === 0) {
      return <p className="muted">{emptyHint}</p>;
    }
    return rows.map((row) => (
      <button
        key={row.key}
        type="button"
        className={`twin-list-item ${selectedKey === row.key ? "active" : ""}`}
        onClick={() => setSelectedKey(row.key)}
      >
        <span className="twin-type-dot" style={{ background: CATEGORY_COLOR[categoryOf(row.type)] }} />
        <span>
          <strong>{row.key}</strong>
          <span className="muted">
            {" "}
            {row.type} · {row.currentVersion.workflowState}
          </span>
          <div>{row.currentVersion.title}</div>
          {expanded ? (
            <pre className="twin-card-preview">{row.currentVersion.content}</pre>
          ) : null}
        </span>
      </button>
    ));
  }

  function renderCard(
    pane: ExpandPane,
    title: string,
    color: string,
    query: string,
    onQuery: (value: string) => void,
    rows: Artifact[],
    placeholder: string,
  ) {
    return (
      <section className="panel twin-card">
        <div className="twin-card-head">
          <span className="twin-type-dot" style={{ background: color }} />
          <strong>{title}</strong>
          <span className="muted">{rows.length}</span>
          <button
            type="button"
            className="twin-expand-btn"
            title="Expand pane"
            onClick={() => setExpanded(pane)}
            aria-label={`Expand ${title}`}
          >
            Expand ↗
          </button>
        </div>
        <input
          className="twin-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
        />
        <div className="workspace-scroll twin-card-scroll">
          {renderCardList(
            rows,
            selectedKey ? "No related items for the current selection." : "Nothing in this product yet.",
          )}
        </div>
      </section>
    );
  }

  function closeModal(): void {
    // Selection / search state already live on the page — closing syncs them back to the panes.
    setExpanded(null);
  }

  const selected = selectedKey ? byKey.get(selectedKey) : null;
  const modalTitle =
    expanded === "requirements"
      ? "Requirements"
      : expanded === "code"
        ? "Code / Design"
        : expanded === "tests"
          ? "Tests"
          : expanded === "graph"
            ? "Node graph"
            : "";

  return (
    <div className="twin-explorer">
      <header className="workspace-header">
        <div>
          <h1>Twin Explorer</h1>
          <p>Zoom the graph · expand panes · select nodes to refresh related cards</p>
        </div>
        <div className="toolbar twin-product-bar">
          <label className="muted">
            Product
            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
              disabled={!projects.length}
            >
              {projects.length === 0 ? <option value="">No product</option> : null}
              {projects.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.name} ({row.key})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setSelectedKey("");
              setReqQuery("");
              setCodeQuery("");
              setTestQuery("");
            }}
          >
            Clear selection
          </button>
          {!getToken() ? (
            <Link to="/" className="error">
              Sign in required
            </Link>
          ) : (
            <span className="muted">{session?.username}</span>
          )}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel twin-graph-panel twin-graph-full">
        <div className="twin-card-head twin-graph-toolbar">
          <div className="workspace-pane-title" style={{ marginBottom: 0 }}>
            Node graph
            <span className="muted">
              {" "}
              · {nodes.length} nodes · zoom {Math.round(zoom * 100)}%
              {selected ? ` · focused on ${selected.key}` : ""}
            </span>
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button type="button" onClick={() => zoomBy(1.15)} title="Zoom in (more detail)">
              +
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.15)} title="Zoom out">
              −
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Reset
            </button>
            <button type="button" className="twin-expand-btn" onClick={() => setExpanded("graph")} title="Expand graph">
              Expand ↗
            </button>
          </div>
        </div>
        {renderGraphSvg()}
        <div className="twin-legend twin-legend-light">
          <span>
            <span className="twin-type-dot" style={{ background: CATEGORY_COLOR.requirement }} /> Requirements
          </span>
          <span>
            <span className="twin-type-dot" style={{ background: CATEGORY_COLOR.code }} /> Design / Code
          </span>
          <span>
            <span className="twin-type-dot" style={{ background: CATEGORY_COLOR.test }} /> Tests
          </span>
          <span className="muted">Scroll to zoom · drag to pan · zoom in for titles &amp; details</span>
        </div>
      </section>

      <div className="twin-cards-row">
        {renderCard(
          "requirements",
          "Requirements",
          CATEGORY_COLOR.requirement,
          reqQuery,
          setReqQuery,
          relatedRequirements,
          "Search requirements / stories…",
        )}
        {renderCard(
          "code",
          "Code / Design",
          CATEGORY_COLOR.code,
          codeQuery,
          setCodeQuery,
          relatedCode,
          "Search code / design…",
        )}
        {renderCard(
          "tests",
          "Tests",
          CATEGORY_COLOR.test,
          testQuery,
          setTestQuery,
          relatedTests,
          "Search tests / Gherkin…",
        )}
      </div>

      {selected ? (
        <div className="panel twin-selection-banner">
          <div>
            <strong>
              {selected.key} · {selected.type}
            </strong>
            <span className="muted">
              {" "}
              {selected.currentVersion.workflowState} — {selected.currentVersion.title}
            </span>
            <div className="muted" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
              Connected: {relatedRequirements.length} requirement(s) · {relatedCode.length} code/design ·{" "}
              {relatedTests.length} test(s). Cards below list only artifacts linked to this node.
            </div>
          </div>
          <button type="button" onClick={() => setSelectedKey("")}>
            Clear
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div className="twin-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="twin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="twin-modal-head">
              <h2>{modalTitle}</h2>
              <button type="button" onClick={closeModal} title="Collapse">
                Collapse ✕
              </button>
            </div>
            <div className="twin-modal-body">
              {expanded === "graph" ? (
                <>
                  <div className="toolbar">
                    <button type="button" onClick={() => zoomBy(1.15)}>
                      Zoom in (details)
                    </button>
                    <button type="button" onClick={() => zoomBy(1 / 1.15)}>
                      Zoom out
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1.8);
                        setPan({ x: 0, y: 0 });
                      }}
                    >
                      Show titles
                    </button>
                    <span className="muted">{Math.round(zoom * 100)}%</span>
                  </div>
                  {renderGraphSvg(520)}
                </>
              ) : null}
              {expanded === "requirements" ? (
                <>
                  <input
                    className="twin-search"
                    value={reqQuery}
                    onChange={(event) => setReqQuery(event.target.value)}
                    placeholder="Search requirements / stories…"
                  />
                  <div className="twin-modal-scroll">
                    {renderCardList(relatedRequirements, "No matching requirements.")}
                  </div>
                </>
              ) : null}
              {expanded === "code" ? (
                <>
                  <input
                    className="twin-search"
                    value={codeQuery}
                    onChange={(event) => setCodeQuery(event.target.value)}
                    placeholder="Search code / design…"
                  />
                  <div className="twin-modal-scroll">{renderCardList(relatedCode, "No matching code / design.")}</div>
                </>
              ) : null}
              {expanded === "tests" ? (
                <>
                  <input
                    className="twin-search"
                    value={testQuery}
                    onChange={(event) => setTestQuery(event.target.value)}
                    placeholder="Search tests / Gherkin…"
                  />
                  <div className="twin-modal-scroll">{renderCardList(relatedTests, "No matching tests.")}</div>
                </>
              ) : null}
            </div>
            <div className="twin-modal-foot">
              <span className="muted">Collapse applies search &amp; selection back to the explorer panes.</span>
              <button type="button" onClick={closeModal}>
                Collapse
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
