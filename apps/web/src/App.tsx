import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { apiGet, getSessionUser, getToken, onTokenChange, refreshSession, signOut } from "./api";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { WorkspacePage } from "./pages/Workspace";
import { TwinExplorerPage } from "./pages/TwinExplorer";
import { TestPlansPage } from "./pages/TestPlans";
import { TestPlanDetailPage } from "./pages/TestPlanDetail";
import { SetupPage } from "./pages/Setup";
import { ReviewsPage } from "./pages/Reviews";
import { AuditPage } from "./pages/Audit";
import { AiActivityPage } from "./pages/AiActivity";

const NAV_COLLAPSE_KEY = "setwin_nav_collapsed";

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard", icon: "⌂" },
  { to: "/workspace", label: "Workspace", icon: "▦" },
  { to: "/twin", label: "Twin Explorer", icon: "◎" },
  { to: "/test-plans", label: "Test Plans", icon: "☑" },
  { to: "/reviews", label: "Reviews", icon: "✔" },
  { to: "/audit", label: "Audit", icon: "☰" },
  { to: "/ai", label: "AI activity", icon: "⚡" },
  { to: "/setup", label: "Setup", icon: "⚙" },
] as const;

type SystemStatus = {
  databaseReachable: boolean;
  initialized: boolean;
};

async function loadSystemStatus(): Promise<SystemStatus> {
  let databaseReachable = false;
  try {
    const health = await apiGet<{ status?: string; databaseReachable?: boolean }>("/health");
    databaseReachable = health.status === "ok" || health.databaseReachable === true;
  } catch {
    databaseReachable = false;
  }
  let initialized = false;
  try {
    const detail = await apiGet<{ initialized?: boolean }>("/status");
    initialized = Boolean(detail.initialized);
  } catch {
    initialized = false;
  }
  return { databaseReachable, initialized };
}

export function App() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(NAV_COLLAPSE_KEY) === "1");
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const session = getSessionUser();

  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => onTokenChange(() => setSignedIn(Boolean(getToken()))), []);

  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((user) => {
      if (!cancelled) {
        setSignedIn(Boolean(user));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    void loadSystemStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <nav aria-label="Main">
        <div className="nav-top">
          <div className="brand">{collapsed ? "ST" : "SE Twin"}</div>
          <button
            type="button"
            className="nav-collapse-btn"
            title={collapsed ? "Expand menu" : "Collapse menu"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined} title={item.label}>
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            {!collapsed ? <span className="nav-label">{item.label}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="app-main">
        <header className="app-topbar">
          <span className={`topbar-status ${status?.databaseReachable ? "is-up" : status ? "is-down" : ""}`}>
            <span className="topbar-status-dot" aria-hidden />
            Database {status?.databaseReachable ? "up" : status ? "down" : "…"}
            {status?.initialized ? " · initialized" : ""}
          </span>
          {session ? (
            <div className="topbar-user">
              <strong>{session.username}</strong>
              {session.roles.length ? <span className="muted">{session.roles.join(", ")}</span> : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void loadSystemStatus()
                .then(setStatus)
                .catch(() => setStatus(null));
              window.dispatchEvent(new Event("setwin-refresh"));
            }}
          >
            Refresh
          </button>
          <button type="button" className="topbar-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </header>
      <main>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/twin" element={<TwinExplorerPage />} />
          <Route path="/test-plans" element={<TestPlansPage />} />
          <Route path="/test-plans/:id" element={<TestPlanDetailPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/repos" element={<SetupPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/approvals" element={<ReviewsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/ai" element={<AiActivityPage />} />
        </Routes>
      </main>
      </div>
    </div>
  );
}
