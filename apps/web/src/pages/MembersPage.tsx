import { useEffect, useState } from "react";
import { api, money } from "../lib/api";

type Member = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  status: string;
  balanceCents: number;
  creditLimitCents: number;
  creditOutstandingCents: number;
  wantsTradeFlag: boolean;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const data = await api<{ members: Member[] }>("/v1/operator/members");
    setMembers(data.members);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  const filtered = members.filter(
    (m) =>
      m.businessName.toLowerCase().includes(q.toLowerCase()) ||
      m.contactName.toLowerCase().includes(q.toLowerCase()) ||
      m.email.toLowerCase().includes(q.toLowerCase())
  );

  async function freeze(id: string, frozen: boolean) {
    await api(`/v1/operator/members/${id}/freeze`, {
      method: "POST",
      body: JSON.stringify({ frozen }),
    });
    setMsg(frozen ? "Member frozen" : "Member unfrozen");
    await load();
  }

  async function adjustCredit(id: string) {
    const raw = prompt("New credit limit in dollars (e.g. 5000)");
    if (!raw) return;
    const dollars = Number(raw);
    if (Number.isNaN(dollars)) return;
    await api(`/v1/operator/members/${id}/credit`, {
      method: "POST",
      body: JSON.stringify({ limitCents: Math.round(dollars * 100) }),
    });
    setMsg("Credit limit updated");
    await load();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Members</h1>
          <p>Balances, credit lines, freeze controls.</p>
        </div>
        <input
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            minWidth: 240,
            background: "#fffdf8",
          }}
        />
      </div>
      {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Contact</th>
              <th>Balance</th>
              <th>Credit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.businessName}
                  {m.wantsTradeFlag && (
                    <>
                      {" "}
                      <span className="badge">Wants trade</span>
                    </>
                  )}
                </td>
                <td>
                  {m.contactName}
                  <br />
                  <small style={{ color: "var(--muted)" }}>{m.email}</small>
                </td>
                <td>{money(m.balanceCents)}</td>
                <td>
                  {money(m.creditOutstandingCents)} / {money(m.creditLimitCents)}
                </td>
                <td>
                  <span className={`badge ${m.status === "frozen" ? "danger" : ""}`}>
                    {m.status}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn secondary" onClick={() => adjustCredit(m.id)}>
                      Credit
                    </button>
                    {m.status === "frozen" ? (
                      <button className="btn" onClick={() => freeze(m.id, false)}>
                        Unfreeze
                      </button>
                    ) : (
                      <button className="btn danger" onClick={() => freeze(m.id, true)}>
                        Freeze
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
