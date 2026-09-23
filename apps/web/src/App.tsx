import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/Dashboard";
import { WorkspacePage } from "./pages/Workspace";
import { TwinExplorerPage } from "./pages/TwinExplorer";
import { SetupPage } from "./pages/Setup";
import { ReviewsPage } from "./pages/Reviews";
import { AuditPage } from "./pages/Audit";
import { AiActivityPage } from "./pages/AiActivity";

const NAV_COLLAPSE_KEY = "setwin_nav_collapsed";

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard", icon: "⌂" },
  { to: "/workspace", label: "Workspace", icon: "▦" },
  { to: "/twin", label: "Twin Explorer", icon: "◎" },
  { to: "/reviews", label: "Reviews", icon: "☑" },
  { to: "/audit", label: "Audit", icon: "☰" },
  { to: "/ai", label: "AI activity", icon: "⚡" },
  { to: "/setup", label: "Setup", icon: "⚙" },
] as const;

export function App() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(NAV_COLLAPSE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <nav aria-label="Main">
        <div className="nav-top">
          <div className="brand">{collapsed ? "ST" : "SETwin"}</div>
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
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/twin" element={<TwinExplorerPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/repos" element={<SetupPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/approvals" element={<ReviewsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/ai" element={<AiActivityPage />} />
        </Routes>
      </main>
    </div>
  );
}
