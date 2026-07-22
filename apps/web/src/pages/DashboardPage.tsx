import { useEffect, useState } from "react";
import { api, money } from "../lib/api";

type Dashboard = {
  activeMembers: number;
  volumeTodayCents: number;
  feeRevenueMtdCents: number;
  crossNetworkTrades: number;
  accountsNeedingAttention: Array<{
    id: string;
    business_name: string;
    balance_cents: number;
    outstanding_cents: number;
    limit_cents: number;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/v1/operator/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Today at a glance</h1>
          <p>Volume, fees, and members who need a broker touch.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="grid">
            <div className="stat">
              <label>Volume today</label>
              <strong>{money(data.volumeTodayCents)}</strong>
            </div>
            <div className="stat">
              <label>Active members</label>
              <strong>{data.activeMembers}</strong>
            </div>
            <div className="stat">
              <label>Fee revenue MTD</label>
              <strong>{money(data.feeRevenueMtdCents)}</strong>
            </div>
            <div className="stat">
              <label>Cross-network trades</label>
              <strong>{data.crossNetworkTrades}</strong>
            </div>
          </div>

          <div className="panel">
            <h2>Accounts needing attention</h2>
            {data.accountsNeedingAttention.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>Nothing urgent right now.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Balance</th>
                    <th>Credit used</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accountsNeedingAttention.map((a) => (
                    <tr key={a.id}>
                      <td>{a.business_name}</td>
                      <td>{money(a.balance_cents)}</td>
                      <td>
                        {money(a.outstanding_cents ?? 0)} / {money(a.limit_cents ?? 0)}
                      </td>
                      <td>
                        {(a.balance_cents ?? 0) > 500000 ? (
                          <span className="badge">High positive — help them spend</span>
                        ) : (
                          <span className="badge warn">Near credit limit</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
