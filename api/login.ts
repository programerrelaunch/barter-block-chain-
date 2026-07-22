import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStore, mapUser, verifyPassword } from "./_lib/store";

const JWT_SECRET = process.env.JWT_SECRET || "barterchain-dev-secret-change-me";

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })
  );
  const crypto = require("crypto") as typeof import("crypto");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${body}.${sig}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const store = getStore();
  const user = store.users.find((u) => u.email === String(body.email || "").toLowerCase());
  if (!user || !verifyPassword(user.password_hash, body.password || "")) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.status === "frozen") {
    return res.status(403).json({ error: "Account is frozen. Contact your exchange operator." });
  }

  const token = signJwt({
    id: user.id,
    email: user.email,
    role: user.role,
    exchangeId: user.exchange_id,
    businessName: user.business_name,
  });
  return res.status(200).json({ token, user: mapUser(user) });
}
