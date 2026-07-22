import { useEffect, useState } from "react";
import { api, money } from "../lib/api";

type Member = {
  id: string;
  businessName: string;
  balanceCents: number;
  creditOutstandingCents: number;
  wantsTradeFlag: boolean;
};

type Listing = {
  id: string;
  type: string;
  title: string;
  businessName: string;
  priceCents: number;
};

export default function BrokerPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [wants, setWants] = useState<Listing[]>([]);

  useEffect(() => {
    Promise.all([
      api<{ members: Member[] }>("/v1/operator/members"),
      api<{ listings: Listing[] }>("/v1/listings?type=want"),
    ]).then(([m, l]) => {
      setMembers(m.members);
      setWants(l.listings);
    });
  }, []);

  const highPositive = [...members].sort((a, b) => b.balanceCents - a.balanceCents).slice(0, 5);
  const highNegative = [...members]
    .filter((m) => m.creditOutstandingCents > 0)
    .sort((a, b) => b.creditOutstandingCents - a.creditOutstandingCents)
    .slice(0, 5);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Broker workspace</h1>
          <p>Who needs to spend, who needs to sell, and open wants to source.</p>
        </div>
      </div>

      <div className="panel">
        <h2>High positive balances — help them spend</h2>
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Balance</th>
              <th>Wants trade?</th>
            </tr>
          </thead>
          <tbody>
            {highPositive.map((m) => (
              <tr key={m.id}>
                <td>{m.businessName}</td>
                <td>{money(m.balanceCents)}</td>
                <td>{m.wantsTradeFlag ? <span className="badge">Yes</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Credit outstanding — help them sell</h2>
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {highNegative.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ color: "var(--muted)" }}>
                  No outstanding credit right now.
                </td>
              </tr>
            ) : (
              highNegative.map((m) => (
                <tr key={m.id}>
                  <td>{m.businessName}</td>
                  <td>{money(m.creditOutstandingCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Open wants — sourcing queue</h2>
        <table>
          <thead>
            <tr>
              <th>Want</th>
              <th>Member</th>
              <th>Budget</th>
            </tr>
          </thead>
          <tbody>
            {wants.map((w) => (
              <tr key={w.id}>
                <td>{w.title}</td>
                <td>{w.businessName}</td>
                <td>{money(w.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
