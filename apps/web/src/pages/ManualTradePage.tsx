import { FormEvent, useEffect, useState } from "react";
import { api, money } from "../lib/api";

type Member = { id: string; businessName: string; balanceCents: number };

export default function ManualTradePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ members: Member[] }>("/v1/operator/members").then((d) => {
      setMembers(d.members);
      if (d.members[0]) setBuyerId(d.members[0].id);
      if (d.members[1]) setSellerId(d.members[1].id);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult("");
    try {
      const data = await api<any>("/v1/operator/trades", {
        method: "POST",
        body: JSON.stringify({
          buyerId,
          sellerId,
          grossCents: Math.round(Number(amount) * 100),
        }),
      });
      setResult(
        `Settled ${money(data.grossCents)}. Seller fee ${money(data.feeCents)}${
          data.isCrossNetwork ? " (cross-network)" : ""
        }. Ref ${data.tradeRef}`
      );
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Manual trade entry</h1>
          <p>Phone deals go through the same settlement path as the app.</p>
        </div>
      </div>
      <div className="panel">
        <form className="form" onSubmit={onSubmit}>
          <label>
            Buyer
            <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.businessName} ({money(m.balanceCents)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Seller
            <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.businessName} ({money(m.balanceCents)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (trade dollars)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          {result && <div style={{ color: "var(--ok)" }}>{result}</div>}
          <button className="btn">Post trade</button>
        </form>
      </div>
    </>
  );
}
