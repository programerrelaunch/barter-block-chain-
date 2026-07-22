import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, Link, useNavigate } from "react-router-dom";
import { getSession, setSession } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import ManualTradePage from "./pages/ManualTradePage";
import BrokerPage from "./pages/BrokerPage";
import AdminPage from "./pages/AdminPage";

function Shell({ children }: { children: ReactNode }) {
  const session = getSession();
  const location = useLocation();
  const navigate = useNavigate();
  if (!session) return <Navigate to="/login" replace />;

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/members", label: "Members" },
    { to: "/broker", label: "Broker desk" },
    { to: "/manual-trade", label: "Enter trade" },
  ];
  if (session.user.role === "admin") {
    links.push({ to: "/admin", label: "Super admin" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Barter<span>Chain</span>
        </div>
        <p>
          {session.user.businessName}
          <br />
          <small>{session.user.role}</small>
        </p>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={location.pathname === l.to ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 28 }}>
          <button
            className="btn secondary"
            onClick={() => {
              setSession(null);
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Shell>
            <DashboardPage />
          </Shell>
        }
      />
      <Route
        path="/members"
        element={
          <Shell>
            <MembersPage />
          </Shell>
        }
      />
      <Route
        path="/broker"
        element={
          <Shell>
            <BrokerPage />
          </Shell>
        }
      />
      <Route
        path="/manual-trade"
        element={
          <Shell>
            <ManualTradePage />
          </Shell>
        }
      />
      <Route
        path="/admin"
        element={
          <Shell>
            <AdminPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
