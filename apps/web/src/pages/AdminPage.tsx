import { useEffect, useState } from "react";
import { api, money } from "../lib/api";

type Analytics = {
  totalVolumeCents: number;
  crossNetworkVolumeCents: number;
  platformFeeRevenueCents: number;
  tokenSupplyCents: number;
  creditBackedCents: number;
  earnedCents: number;
  activeExchanges: number;
};

type Exchange = {
  id: string;
  name: string;
  slug: string;
  status: string;
  fee_bps: number;
};

export default function AdminPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [a, e, au] = await Promise.all([
      api<Analytics>("/v1/admin/analytics"),
      api<{ exchanges: Exchange[] }>("/v1/admin/exchanges"),
      api<{ events: any[] }>("/v1/admin/audit"),
    ]);
    setAnalytics(a);
    setExchanges(e.exchanges);
    setAudit(au.events);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function toggle(id: string, status: "active" | "suspended") {
    await api(`/v1/admin/exchanges/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (error) {
    return (
      <div className="topbar">
        <div>
          <h1>Super admin</h1>
          <p className="error">{error} — sign in as admin@barterchain.local</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Super admin</h1>
          <p>Network health, supply, and exchange controls.</p>
        </div>
      </div>

      {analytics && (
        <div className="grid">
          <div className="stat">
            <label>Total volume</label>
            <strong>{money(analytics.totalVolumeCents)}</strong>
          </div>
          <div className="stat">
            <label>Cross-network volume</label>
            <strong>{money(analytics.crossNetworkVolumeCents)}</strong>
          </div>
          <div className="stat">
            <label>Platform fees</label>
            <strong>{money(analytics.platformFeeRevenueCents)}</strong>
          </div>
          <div className="stat">
            <label>Active exchanges</label>
            <strong>{analytics.activeExchanges}</strong>
          </div>
        </div>
      )}

      {analytics && (
        <div className="panel">
          <h2>Token supply</h2>
          <table>
            <tbody>
              <tr>
                <td>Outstanding balances</td>
                <td>{money(analytics.tokenSupplyCents)}</td>
              </tr>
              <tr>
                <td>Credit-backed</td>
                <td>{money(analytics.creditBackedCents)}</td>
              </tr>
              <tr>
                <td>Earned</td>
                <td>{money(analytics.earnedCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2>Exchanges</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Fee</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((ex) => (
              <tr key={ex.id}>
                <td>{ex.name}</td>
                <td>{ex.slug}</td>
                <td>{(ex.fee_bps / 100).toFixed(0)}%</td>
                <td>
                  <span className={`badge ${ex.status === "suspended" ? "danger" : ""}`}>
                    {ex.status}
                  </span>
                </td>
                <td>
                  {ex.status === "active" ? (
                    <button className="btn danger" onClick={() => toggle(ex.id, "suspended")}>
                      Suspend
                    </button>
                  ) : (
                    <button className="btn" onClick={() => toggle(ex.id, "active")}>
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Audit log</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {audit.slice(0, 20).map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.action}</td>
                <td>
                  {e.target_type} {e.target_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
