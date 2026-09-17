import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/Dashboard";
import { TwinExplorerPage } from "./pages/TwinExplorer";
import { ReviewsPage } from "./pages/Reviews";
import { ApprovalsPage } from "./pages/Approvals";
import { AuditPage } from "./pages/Audit";
import { AiActivityPage } from "./pages/AiActivity";

export function App() {
  return (
    <div className="app-shell">
      <nav>
        <div className="brand">SETwin</div>
        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/twin">Twin Explorer</NavLink>
        <NavLink to="/reviews">Reviews</NavLink>
        <NavLink to="/approvals">Approvals</NavLink>
        <NavLink to="/audit">Audit</NavLink>
        <NavLink to="/ai">AI activity</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/twin" element={<TwinExplorerPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/ai" element={<AiActivityPage />} />
        </Routes>
      </main>
    </div>
  );
}
