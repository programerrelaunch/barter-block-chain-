import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, getSession, setSession } from "../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const existing = getSession();
  const [email, setEmail] = useState("admin@barterchain.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (existing) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: any }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession({ token: data.token, user: data.user });
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>BarterChain</h1>
        <p className="lede">Operator & admin back office for trade-dollar exchanges.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="lede" style={{ marginTop: 18, fontSize: "0.85rem" }}>
          Try <code>admin@barterchain.local</code> / <code>admin123</code> or member portals via the
          mobile app.
        </p>
      </div>
    </div>
  );
}
