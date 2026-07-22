import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getStore,
  mapUser,
  settleTrade,
  verifyPassword,
  computeFeePreview,
} from "../_lib/store";

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

function verifyJwt(token: string): any | null {
  try {
    const crypto = require("crypto") as typeof import("crypto");
    const [header, body, sig] = token.split(".");
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
}

function readBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function authUser(req: VercelRequest) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyJwt(header.slice(7));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const store = getStore();
  const rawPath = req.query.path;
  let parts = Array.isArray(rawPath) ? rawPath : rawPath ? [String(rawPath)] : [];
  if (parts.length === 0 && req.url) {
    const pathname = req.url.split("?")[0];
    const stripped = pathname.replace(/^\/api\/v1\/?/, "").replace(/^\/v1\/?/, "");
    parts = stripped ? stripped.split("/").filter(Boolean) : [];
  }
  const path = parts.join("/");
  const method = req.method || "GET";
  const body = readBody(req);

  try {
    if (method === "POST" && path === "auth/login") {
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

    if (method === "GET" && path === "auth/me") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const user = store.users.find((u) => u.id === auth.id);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const credit = store.creditLines.find((c) => c.user_id === user.id);
      const exchange = store.exchanges.find((e) => e.id === user.exchange_id);
      return res.status(200).json({
        user: mapUser(user),
        credit: credit
          ? {
              limitCents: credit.limit_cents,
              outstandingCents: credit.outstanding_cents,
              availableCents: credit.limit_cents - credit.outstanding_cents,
              status: credit.status,
            }
          : null,
        exchange: exchange ? { id: exchange.id, name: exchange.name, slug: exchange.slug } : null,
      });
    }

    if (method === "GET" && path === "listings") {
      let listings = store.listings.filter((l) => l.status === "active");
      const q = req.query as Record<string, string>;
      if (q.type) listings = listings.filter((l) => l.type === q.type);
      if (q.category) listings = listings.filter((l) => l.category_id === q.category);
      if (q.newOnly === "1") {
        const cutoff = Date.now() - 72 * 3600 * 1000;
        listings = listings.filter((l) => new Date(l.created_at).getTime() >= cutoff);
      }
      if (q.q) {
        const needle = q.q.toLowerCase();
        listings = listings.filter((l) => {
          const owner = store.users.find((u) => u.id === l.user_id);
          return (
            l.title.toLowerCase().includes(needle) ||
            l.description.toLowerCase().includes(needle) ||
            (owner?.business_name.toLowerCase().includes(needle) ?? false)
          );
        });
      }
      if (q.exchange) {
        const ex = store.exchanges.find((e) => e.slug === q.exchange);
        if (ex) listings = listings.filter((l) => l.exchange_id === ex.id);
      }
      return res.status(200).json({
        listings: listings.map((l) => {
          const owner = store.users.find((u) => u.id === l.user_id)!;
          const ex = store.exchanges.find((e) => e.id === l.exchange_id)!;
          return {
            id: l.id,
            userId: l.user_id,
            exchangeId: l.exchange_id,
            exchangeName: ex.name,
            type: l.type,
            title: l.title,
            description: l.description,
            categoryId: l.category_id,
            priceCents: l.price_cents,
            paymentMode: l.payment_mode,
            cashPortionPct: l.cash_portion_pct,
            imagesJson: l.images_json,
            status: l.status,
            featuredUntil: l.featured_until,
            createdAt: l.created_at,
            businessName: owner.business_name,
          };
        }),
      });
    }

    if (method === "GET" && path.startsWith("listings/") && path.split("/").length === 2) {
      const id = path.split("/")[1];
      const l = store.listings.find((x) => x.id === id);
      if (!l) return res.status(404).json({ error: "Listing not found" });
      const owner = store.users.find((u) => u.id === l.user_id)!;
      const ex = store.exchanges.find((e) => e.id === l.exchange_id)!;
      return res.status(200).json({
        listing: {
          id: l.id,
          userId: l.user_id,
          exchangeId: l.exchange_id,
          exchangeName: ex.name,
          type: l.type,
          title: l.title,
          description: l.description,
          categoryId: l.category_id,
          priceCents: l.price_cents,
          paymentMode: l.payment_mode,
          imagesJson: l.images_json,
          createdAt: l.created_at,
          businessName: owner.business_name,
          contactName: owner.contact_name,
          phone: owner.phone,
          wantsTradeFlag: owner.wants_trade_flag,
        },
      });
    }

    if (method === "GET" && path === "categories") {
      return res.status(200).json({ categories: store.categories });
    }

    if (method === "GET" && path === "directory") {
      const q = req.query as Record<string, string>;
      let members = store.users.filter((u) => u.role === "member" && u.status === "active");
      if (q.q) {
        const needle = q.q.toLowerCase();
        members = members.filter(
          (u) =>
            u.business_name.toLowerCase().includes(needle) ||
            u.contact_name.toLowerCase().includes(needle)
        );
      }
      if (q.wantsTrade === "1") members = members.filter((u) => u.wants_trade_flag);
      if (q.exchange) {
        const ex = store.exchanges.find((e) => e.slug === q.exchange);
        if (ex) members = members.filter((u) => u.exchange_id === ex.id);
      }
      return res.status(200).json({
        members: members.map((u) => {
          const ex = store.exchanges.find((e) => e.id === u.exchange_id)!;
          return {
            id: u.id,
            business_name: u.business_name,
            contact_name: u.contact_name,
            wants_trade_flag: u.wants_trade_flag ? 1 : 0,
            exchange_id: u.exchange_id,
            exchange_name: ex.name,
            slug: ex.slug,
          };
        }),
      });
    }

    if (method === "GET" && path === "exchanges") {
      return res.status(200).json({
        exchanges: store.exchanges
          .filter((e) => e.status === "active")
          .map((e) => ({
            id: e.id,
            name: e.name,
            slug: e.slug,
            status: e.status,
            fee_bps: e.fee_bps,
          })),
      });
    }

    if (method === "GET" && path === "wallet") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const user = store.users.find((u) => u.id === auth.id)!;
      const credit = store.creditLines.find((c) => c.user_id === user.id);
      return res.status(200).json({
        balanceCents: user.balance_cents,
        displayBalance: `$${(user.balance_cents / 100).toFixed(2)}`,
        creditAvailableCents: credit ? credit.limit_cents - credit.outstanding_cents : 0,
        creditOutstandingCents: credit?.outstanding_cents ?? 0,
        qrPayload: JSON.stringify({
          memberId: user.id,
          businessName: user.business_name,
          wallet: user.wallet_address,
        }),
      });
    }

    if (method === "GET" && path === "trades") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const trades = store.trades.filter((t) => t.buyer_id === auth.id || t.seller_id === auth.id);
      return res.status(200).json({
        trades: trades.map((t) => {
          const buyer = store.users.find((u) => u.id === t.buyer_id)!;
          const seller = store.users.find((u) => u.id === t.seller_id)!;
          return {
            id: t.id,
            buyerId: t.buyer_id,
            sellerId: t.seller_id,
            buyerName: buyer.business_name,
            sellerName: seller.business_name,
            grossCents: t.gross_cents,
            feeCents: t.fee_cents,
            isCrossNetwork: t.is_cross_network,
            status: t.status,
            tradeRef: t.trade_ref,
            txHash: t.tx_hash,
            createdAt: t.created_at,
            direction: t.buyer_id === auth.id ? "sent" : "received",
          };
        }),
      });
    }

    if (method === "POST" && path === "trades/preview") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const buyer = store.users.find((u) => u.id === auth.id)!;
      const seller = store.users.find((u) => u.id === body.sellerId);
      if (!seller) return res.status(404).json({ error: "Buyer or seller not found" });
      const sellerEx = store.exchanges.find((e) => e.id === seller.exchange_id)!;
      return res.status(200).json(
        computeFeePreview({
          grossCents: body.grossCents,
          isCrossNetwork: buyer.exchange_id !== seller.exchange_id,
          inNetworkFeeBps: sellerEx.fee_bps,
        })
      );
    }

    if (method === "POST" && path === "trades") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const idem = (req.headers["idempotency-key"] as string) || body.idempotencyKey;
      if (idem && store.idempotency[idem]) return res.status(201).json(store.idempotency[idem]);
      const result = settleTrade(store, {
        buyerId: auth.id,
        sellerId: body.sellerId,
        grossCents: body.grossCents,
        cashPortionCents: body.cashPortionCents,
        listingId: body.listingId,
        tradeRef: body.tradeRef,
      });
      if (idem) store.idempotency[idem] = result;
      return res.status(201).json(result);
    }

    if (method === "PATCH" && path === "members/me") {
      const auth = authUser(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      const user = store.users.find((u) => u.id === auth.id)!;
      if (body.businessName) user.business_name = body.businessName;
      if (body.contactName) user.contact_name = body.contactName;
      if (body.phone !== undefined) user.phone = body.phone;
      if (body.wantsTradeFlag !== undefined) user.wants_trade_flag = !!body.wantsTradeFlag;
      return res.status(200).json({ user: mapUser(user) });
    }

    if (method === "GET" && path === "operator/dashboard") {
      const auth = authUser(req);
      if (!auth || !["operator", "admin", "broker"].includes(auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const exchangeId = auth.role === "admin" ? (req.query.exchangeId as string) || auth.exchangeId : auth.exchangeId;
      const members = store.users.filter((u) => u.exchange_id === exchangeId && u.role === "member");
      const today = new Date().toISOString().slice(0, 10);
      const month = new Date().toISOString().slice(0, 7);
      const sellerTrades = store.trades.filter((t) => {
        const seller = store.users.find((u) => u.id === t.seller_id);
        return seller?.exchange_id === exchangeId && t.status === "settled";
      });
      return res.status(200).json({
        activeMembers: members.length,
        volumeTodayCents: sellerTrades
          .filter((t) => t.created_at.startsWith(today))
          .reduce((s, t) => s + t.gross_cents, 0),
        feeRevenueMtdCents: sellerTrades
          .filter((t) => t.created_at.startsWith(month))
          .reduce((s, t) => s + t.operator_fee_cents, 0),
        crossNetworkTrades: sellerTrades.filter((t) => t.is_cross_network).length,
        accountsNeedingAttention: members
          .map((u) => {
            const c = store.creditLines.find((x) => x.user_id === u.id);
            return {
              id: u.id,
              business_name: u.business_name,
              balance_cents: u.balance_cents,
              outstanding_cents: c?.outstanding_cents ?? 0,
              limit_cents: c?.limit_cents ?? 0,
            };
          })
          .filter(
            (a) =>
              a.balance_cents > 500000 ||
              (a.limit_cents > 0 && a.outstanding_cents > a.limit_cents * 0.8)
          ),
      });
    }

    if (method === "GET" && path === "operator/members") {
      const auth = authUser(req);
      if (!auth || !["operator", "admin", "broker"].includes(auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const exchangeId = auth.role === "admin" ? (req.query.exchangeId as string) || auth.exchangeId : auth.exchangeId;
      const members = store.users.filter((u) => u.exchange_id === exchangeId && u.role === "member");
      return res.status(200).json({
        members: members.map((u) => {
          const c = store.creditLines.find((x) => x.user_id === u.id);
          return {
            ...mapUser(u),
            creditLimitCents: c?.limit_cents ?? 0,
            creditOutstandingCents: c?.outstanding_cents ?? 0,
          };
        }),
      });
    }

    if (method === "POST" && path === "operator/trades") {
      const auth = authUser(req);
      if (!auth || !["operator", "admin", "broker"].includes(auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const result = settleTrade(store, {
        buyerId: body.buyerId,
        sellerId: body.sellerId,
        grossCents: body.grossCents,
        cashPortionCents: body.cashPortionCents,
        brokerId: auth.id,
      });
      return res.status(201).json(result);
    }

    if (method === "POST" && path.match(/^operator\/members\/[^/]+\/freeze$/)) {
      const auth = authUser(req);
      if (!auth || !["operator", "admin"].includes(auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = path.split("/")[2];
      const member = store.users.find((u) => u.id === id);
      if (!member) return res.status(404).json({ error: "Not found" });
      if (auth.role !== "admin" && member.exchange_id !== auth.exchangeId) {
        return res.status(403).json({ error: "Cannot freeze members outside your exchange" });
      }
      member.status = body.frozen ? "frozen" : "active";
      return res.status(200).json({ ok: true, status: member.status });
    }

    if (method === "POST" && path.match(/^operator\/members\/[^/]+\/credit$/)) {
      const auth = authUser(req);
      if (!auth || !["operator", "admin"].includes(auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = path.split("/")[2];
      let credit = store.creditLines.find((c) => c.user_id === id);
      if (!credit) {
        credit = {
          id: `cl_${Date.now()}`,
          user_id: id,
          limit_cents: body.limitCents,
          outstanding_cents: 0,
          status: "active",
        };
        store.creditLines.push(credit);
      } else {
        credit.limit_cents = body.limitCents;
      }
      return res.status(200).json({ ok: true });
    }

    if (method === "GET" && path === "admin/exchanges") {
      const auth = authUser(req);
      if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      return res.status(200).json({ exchanges: store.exchanges });
    }

    if (method === "POST" && path.match(/^admin\/exchanges\/[^/]+\/status$/)) {
      const auth = authUser(req);
      if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const id = path.split("/")[2];
      const ex = store.exchanges.find((e) => e.id === id);
      if (!ex) return res.status(404).json({ error: "Not found" });
      ex.status = body.status;
      return res.status(200).json({ ok: true });
    }

    if (method === "GET" && path === "admin/analytics") {
      const auth = authUser(req);
      if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const settled = store.trades.filter((t) => t.status === "settled");
      const supply = store.users.reduce((s, u) => s + u.balance_cents, 0);
      const creditBacked = store.creditLines.reduce((s, c) => s + c.outstanding_cents, 0);
      return res.status(200).json({
        totalVolumeCents: settled.reduce((s, t) => s + t.gross_cents, 0),
        crossNetworkVolumeCents: settled
          .filter((t) => t.is_cross_network)
          .reduce((s, t) => s + t.gross_cents, 0),
        platformFeeRevenueCents: settled.reduce((s, t) => s + t.platform_fee_cents, 0),
        tokenSupplyCents: supply,
        creditBackedCents: creditBacked,
        earnedCents: Math.max(0, supply - creditBacked),
        activeExchanges: store.exchanges.filter((e) => e.status === "active").length,
      });
    }

    if (method === "GET" && path === "admin/audit") {
      const auth = authUser(req);
      if (!auth || auth.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      return res.status(200).json({ events: store.audit.slice(0, 100) });
    }

    return res.status(404).json({ error: `Not found: ${method} /v1/${path}` });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
