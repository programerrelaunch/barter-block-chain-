import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db/schema";
import { authenticate, mapUser, requireRoles } from "../middleware/auth";
import { settlementService } from "../services/settlement";

function verifyPassword(stored: string, pw: string): boolean {
  return stored === `demo:${Buffer.from(pw).toString("base64")}`;
}

function hashPassword(pw: string): string {
  return `demo:${Buffer.from(pw).toString("base64")}`;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "barterchain-api" }));

  // --- Auth ---
  app.post("/v1/auth/login", async (request, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(request.body);

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(body.email.toLowerCase()) as any;
    if (!row || !verifyPassword(row.password_hash, body.password)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (row.status === "frozen") {
      return reply.code(403).send({ error: "Account is frozen. Contact your exchange operator." });
    }

    const token = await reply.jwtSign({
      id: row.id,
      email: row.email,
      role: row.role,
      exchangeId: row.exchange_id,
      businessName: row.business_name,
    });

    return { token, user: mapUser(row) };
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        businessName: z.string().min(2),
        contactName: z.string().min(2),
        phone: z.string().optional(),
        exchangeSlug: z.string().default("bay-area"),
      })
      .parse(request.body);

    const exchange = db
      .prepare("SELECT * FROM exchanges WHERE slug = ? AND status = 'active'")
      .get(body.exchangeSlug) as any;
    if (!exchange) return reply.code(400).send({ error: "Exchange not found" });

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(body.email.toLowerCase());
    if (exists) return reply.code(409).send({ error: "Email already registered" });

    const id = nanoid();
    const wallet = `0x${id.replace(/[^a-f0-9]/gi, "").padEnd(40, "0").slice(0, 40)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (
        id, exchange_id, wallet_address, email, phone, business_name, contact_name,
        role, password_hash, status, wants_trade_flag, balance_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'member', ?, 'active', 1, 0, ?)
    `).run(
      id,
      exchange.id,
      wallet,
      body.email.toLowerCase(),
      body.phone ?? null,
      body.businessName,
      body.contactName,
      hashPassword(body.password),
      now
    );

    db.prepare(`
      INSERT INTO credit_lines (id, user_id, limit_cents, outstanding_cents, approved_by, approved_at, status)
      VALUES (?, ?, 100000, 0, NULL, NULL, 'active')
    `).run(nanoid(), id);

    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    const token = await reply.jwtSign({
      id,
      email: body.email.toLowerCase(),
      role: "member",
      exchangeId: exchange.id,
      businessName: body.businessName,
    });

    return reply.code(201).send({ token, user: mapUser(row) });
  });

  app.get("/v1/auth/me", { preHandler: authenticate }, async (request) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user.id);
    const credit = db
      .prepare("SELECT * FROM credit_lines WHERE user_id = ?")
      .get(request.user.id) as any;
    const exchange = db
      .prepare("SELECT id, name, slug FROM exchanges WHERE id = ?")
      .get(request.user.exchangeId);
    return {
      user: mapUser(row),
      credit: credit
        ? {
            limitCents: credit.limit_cents,
            outstandingCents: credit.outstanding_cents,
            availableCents: credit.limit_cents - credit.outstanding_cents,
            status: credit.status,
          }
        : null,
      exchange,
    };
  });

  // --- Listings / Marketplace ---
  app.get("/v1/listings", async (request) => {
    const q = request.query as {
      type?: string;
      category?: string;
      exchange?: string;
      scope?: string;
      q?: string;
      newOnly?: string;
    };

    let sql = `
      SELECT l.*, u.business_name, e.name as exchange_name, e.slug as exchange_slug
      FROM listings l
      JOIN users u ON u.id = l.user_id
      JOIN exchanges e ON e.id = l.exchange_id
      WHERE l.status = 'active'
    `;
    const params: unknown[] = [];

    if (q.type) {
      sql += " AND l.type = ?";
      params.push(q.type);
    }
    if (q.category) {
      sql += " AND l.category_id = ?";
      params.push(q.category);
    }
    if (q.exchange) {
      sql += " AND e.slug = ?";
      params.push(q.exchange);
    }
    if (q.q) {
      sql += " AND (l.title LIKE ? OR l.description LIKE ? OR u.business_name LIKE ?)";
      const like = `%${q.q}%`;
      params.push(like, like, like);
    }
    if (q.newOnly === "1") {
      sql += " AND l.created_at >= datetime('now', '-72 hours')";
    }

    sql += " ORDER BY (l.featured_until IS NOT NULL AND l.featured_until > datetime('now')) DESC, l.created_at DESC LIMIT 100";

    const rows = db.prepare(sql).all(...params);
    return {
      listings: rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        exchangeId: r.exchange_id,
        exchangeName: r.exchange_name,
        type: r.type,
        title: r.title,
        description: r.description,
        categoryId: r.category_id,
        priceCents: r.price_cents,
        paymentMode: r.payment_mode,
        cashPortionPct: r.cash_portion_pct,
        imagesJson: JSON.parse(r.images_json),
        status: r.status,
        featuredUntil: r.featured_until,
        createdAt: r.created_at,
        businessName: r.business_name,
      })),
    };
  });

  app.get("/v1/listings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const r = db
      .prepare(
        `SELECT l.*, u.business_name, u.contact_name, u.phone, u.wants_trade_flag, e.name as exchange_name
         FROM listings l
         JOIN users u ON u.id = l.user_id
         JOIN exchanges e ON e.id = l.exchange_id
         WHERE l.id = ?`
      )
      .get(id) as any;
    if (!r) return reply.code(404).send({ error: "Listing not found" });
    return {
      listing: {
        id: r.id,
        userId: r.user_id,
        exchangeId: r.exchange_id,
        exchangeName: r.exchange_name,
        type: r.type,
        title: r.title,
        description: r.description,
        categoryId: r.category_id,
        priceCents: r.price_cents,
        paymentMode: r.payment_mode,
        imagesJson: JSON.parse(r.images_json),
        createdAt: r.created_at,
        businessName: r.business_name,
        contactName: r.contact_name,
        phone: r.phone,
        wantsTradeFlag: !!r.wants_trade_flag,
      },
    };
  });

  app.post("/v1/listings", { preHandler: authenticate }, async (request, reply) => {
    const body = z
      .object({
        type: z.enum(["offer", "want"]),
        title: z.string().min(3),
        description: z.string().min(10),
        categoryId: z.string().optional(),
        priceCents: z.number().int().positive(),
        paymentMode: z.enum(["full_trade", "split"]).default("full_trade"),
        cashPortionPct: z.number().int().min(0).max(100).default(0),
      })
      .parse(request.body);

    const id = nanoid();
    db.prepare(`
      INSERT INTO listings (
        id, user_id, exchange_id, type, title, description, category_id,
        price_cents, payment_mode, cash_portion_pct, images_json, status, featured_until, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'active', NULL, ?)
    `).run(
      id,
      request.user.id,
      request.user.exchangeId,
      body.type,
      body.title,
      body.description,
      body.categoryId ?? null,
      body.priceCents,
      body.paymentMode,
      body.cashPortionPct,
      new Date().toISOString()
    );

    return reply.code(201).send({ id });
  });

  app.get("/v1/categories", async () => {
    const rows = db.prepare("SELECT * FROM categories ORDER BY name").all();
    return { categories: rows };
  });

  // --- Directory ---
  app.get("/v1/directory", async (request) => {
    const q = request.query as { q?: string; wantsTrade?: string; exchange?: string };
    let sql = `
      SELECT u.id, u.business_name, u.contact_name, u.wants_trade_flag, u.exchange_id, e.name as exchange_name, e.slug
      FROM users u
      JOIN exchanges e ON e.id = u.exchange_id
      WHERE u.role = 'member' AND u.status = 'active'
    `;
    const params: unknown[] = [];
    if (q.q) {
      sql += " AND (u.business_name LIKE ? OR u.contact_name LIKE ?)";
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.wantsTrade === "1") sql += " AND u.wants_trade_flag = 1";
    if (q.exchange) {
      sql += " AND e.slug = ?";
      params.push(q.exchange);
    }
    sql += " ORDER BY u.business_name LIMIT 100";
    return { members: db.prepare(sql).all(...params) };
  });

  // --- Wallet / Activity ---
  app.get("/v1/wallet", { preHandler: authenticate }, async (request) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user.id) as any;
    const credit = db
      .prepare("SELECT * FROM credit_lines WHERE user_id = ?")
      .get(request.user.id) as any;
    return {
      balanceCents: row.balance_cents,
      displayBalance: `$${(row.balance_cents / 100).toFixed(2)}`,
      creditAvailableCents: credit ? credit.limit_cents - credit.outstanding_cents : 0,
      creditOutstandingCents: credit?.outstanding_cents ?? 0,
      qrPayload: JSON.stringify({
        memberId: row.id,
        businessName: row.business_name,
        wallet: row.wallet_address,
      }),
    };
  });

  app.get("/v1/trades", { preHandler: authenticate }, async (request) => {
    const rows = db
      .prepare(
        `SELECT t.*,
          b.business_name as buyer_name,
          s.business_name as seller_name
         FROM trades t
         JOIN users b ON b.id = t.buyer_id
         JOIN users s ON s.id = t.seller_id
         WHERE t.buyer_id = ? OR t.seller_id = ?
         ORDER BY t.created_at DESC
         LIMIT 100`
      )
      .all(request.user.id, request.user.id);
    return {
      trades: rows.map((t: any) => ({
        id: t.id,
        buyerId: t.buyer_id,
        sellerId: t.seller_id,
        buyerName: t.buyer_name,
        sellerName: t.seller_name,
        grossCents: t.gross_cents,
        feeCents: t.fee_cents,
        isCrossNetwork: !!t.is_cross_network,
        status: t.status,
        tradeRef: t.trade_ref,
        txHash: t.tx_hash,
        createdAt: t.created_at,
        direction: t.buyer_id === request.user.id ? "sent" : "received",
      })),
    };
  });

  app.post("/v1/trades/preview", { preHandler: authenticate }, async (request) => {
    const body = z
      .object({
        sellerId: z.string(),
        grossCents: z.number().int().positive(),
      })
      .parse(request.body);
    return settlementService.preview(request.user.id, body.sellerId, body.grossCents);
  });

  app.post("/v1/trades", { preHandler: authenticate }, async (request, reply) => {
    const body = z
      .object({
        sellerId: z.string(),
        grossCents: z.number().int().positive(),
        cashPortionCents: z.number().int().min(0).optional(),
        listingId: z.string().optional(),
        tradeRef: z.string().optional(),
        idempotencyKey: z.string().optional(),
      })
      .parse(request.body);

    const idem = body.idempotencyKey ?? request.headers["idempotency-key"];
    if (typeof idem === "string") {
      const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idem) as
        | { response_json: string }
        | undefined;
      if (cached) return JSON.parse(cached.response_json);
    }

    try {
      const result = settlementService.settleTrade({
        buyerId: request.user.id,
        sellerId: body.sellerId,
        grossCents: body.grossCents,
        cashPortionCents: body.cashPortionCents,
        listingId: body.listingId,
        tradeRef: body.tradeRef,
      });

      if (typeof idem === "string") {
        db.prepare(
          "INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)"
        ).run(idem, JSON.stringify(result), new Date().toISOString());
      }

      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // --- Profile ---
  app.patch("/v1/members/me", { preHandler: authenticate }, async (request) => {
    const body = z
      .object({
        businessName: z.string().optional(),
        contactName: z.string().optional(),
        phone: z.string().optional(),
        wantsTradeFlag: z.boolean().optional(),
      })
      .parse(request.body);

    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user.id) as any;
    db.prepare(
      `UPDATE users SET
        business_name = ?,
        contact_name = ?,
        phone = ?,
        wants_trade_flag = ?
       WHERE id = ?`
    ).run(
      body.businessName ?? row.business_name,
      body.contactName ?? row.contact_name,
      body.phone ?? row.phone,
      body.wantsTradeFlag === undefined ? row.wants_trade_flag : body.wantsTradeFlag ? 1 : 0,
      request.user.id
    );
    return { user: mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(request.user.id)) };
  });

  // --- Operator ---
  app.get(
    "/v1/operator/dashboard",
    { preHandler: requireRoles("operator", "admin", "broker") },
    async (request) => {
      const exchangeId =
        request.user.role === "admin"
          ? (request.query as any).exchangeId ?? request.user.exchangeId
          : request.user.exchangeId;

      const members = db
        .prepare("SELECT COUNT(*) as c FROM users WHERE exchange_id = ? AND role = 'member'")
        .get(exchangeId) as { c: number };
      const volume = db
        .prepare(
          `SELECT COALESCE(SUM(gross_cents),0) as v FROM trades t
           JOIN users u ON u.id = t.seller_id
           WHERE u.exchange_id = ? AND t.status = 'settled'
             AND date(t.created_at) = date('now')`
        )
        .get(exchangeId) as { v: number };
      const feesMtd = db
        .prepare(
          `SELECT COALESCE(SUM(operator_fee_cents),0) as v FROM trades t
           JOIN users u ON u.id = t.seller_id
           WHERE u.exchange_id = ? AND t.status = 'settled'
             AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')`
        )
        .get(exchangeId) as { v: number };
      const cross = db
        .prepare(
          `SELECT COUNT(*) as c FROM trades t
           JOIN users u ON u.id = t.seller_id
           WHERE u.exchange_id = ? AND t.is_cross_network = 1 AND t.status = 'settled'`
        )
        .get(exchangeId) as { c: number };
      const attention = db
        .prepare(
          `SELECT u.id, u.business_name, u.balance_cents, c.outstanding_cents, c.limit_cents
           FROM users u
           LEFT JOIN credit_lines c ON c.user_id = u.id
           WHERE u.exchange_id = ? AND u.role = 'member'
             AND (c.outstanding_cents > c.limit_cents * 0.8 OR u.balance_cents > 500000)
           LIMIT 20`
        )
        .all(exchangeId);

      return {
        activeMembers: members.c,
        volumeTodayCents: volume.v,
        feeRevenueMtdCents: feesMtd.v,
        crossNetworkTrades: cross.c,
        accountsNeedingAttention: attention,
      };
    }
  );

  app.get(
    "/v1/operator/members",
    { preHandler: requireRoles("operator", "admin", "broker") },
    async (request) => {
      const exchangeId =
        request.user.role === "admin"
          ? (request.query as any).exchangeId ?? request.user.exchangeId
          : request.user.exchangeId;
      const rows = db
        .prepare(
          `SELECT u.*, c.limit_cents, c.outstanding_cents
           FROM users u
           LEFT JOIN credit_lines c ON c.user_id = u.id
           WHERE u.exchange_id = ? AND u.role = 'member'
           ORDER BY u.business_name`
        )
        .all(exchangeId);
      return {
        members: rows.map((r: any) => ({
          ...mapUser(r),
          creditLimitCents: r.limit_cents ?? 0,
          creditOutstandingCents: r.outstanding_cents ?? 0,
        })),
      };
    }
  );

  app.post(
    "/v1/operator/trades",
    { preHandler: requireRoles("operator", "admin", "broker") },
    async (request, reply) => {
      const body = z
        .object({
          buyerId: z.string(),
          sellerId: z.string(),
          grossCents: z.number().int().positive(),
          cashPortionCents: z.number().int().min(0).optional(),
          notes: z.string().optional(),
        })
        .parse(request.body);

      try {
        const result = settlementService.settleTrade({
          buyerId: body.buyerId,
          sellerId: body.sellerId,
          grossCents: body.grossCents,
          cashPortionCents: body.cashPortionCents,
          brokerId: request.user.id,
        });
        return reply.code(201).send(result);
      } catch (err: any) {
        return reply.code(err.statusCode ?? 500).send({ error: err.message });
      }
    }
  );

  app.post(
    "/v1/operator/members/:id/freeze",
    { preHandler: requireRoles("operator", "admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({ frozen: z.boolean() }).parse(request.body);
      const member = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      if (!member) return reply.code(404).send({ error: "Not found" });
      if (request.user.role !== "admin" && member.exchange_id !== request.user.exchangeId) {
        return reply.code(403).send({ error: "Cannot freeze members outside your exchange" });
      }
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(body.frozen ? "frozen" : "active", id);
      return { ok: true, status: body.frozen ? "frozen" : "active" };
    }
  );

  app.post(
    "/v1/operator/members/:id/credit",
    { preHandler: requireRoles("operator", "admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({ limitCents: z.number().int().min(0) }).parse(request.body);
      const member = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      if (!member) return reply.code(404).send({ error: "Not found" });
      const existing = db.prepare("SELECT id FROM credit_lines WHERE user_id = ?").get(id);
      if (existing) {
        db.prepare("UPDATE credit_lines SET limit_cents = ?, approved_by = ?, approved_at = ? WHERE user_id = ?").run(
          body.limitCents,
          request.user.id,
          new Date().toISOString(),
          id
        );
      } else {
        db.prepare(
          `INSERT INTO credit_lines (id, user_id, limit_cents, outstanding_cents, approved_by, approved_at, status)
           VALUES (?, ?, ?, 0, ?, ?, 'active')`
        ).run(nanoid(), id, body.limitCents, request.user.id, new Date().toISOString());
      }
      return { ok: true };
    }
  );

  // --- Super Admin ---
  app.get("/v1/admin/exchanges", { preHandler: requireRoles("admin") }, async () => {
    const rows = db.prepare("SELECT * FROM exchanges ORDER BY name").all();
    return { exchanges: rows };
  });

  app.post("/v1/admin/exchanges/:id/status", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ status: z.enum(["active", "suspended"]) }).parse(request.body);
    db.prepare("UPDATE exchanges SET status = ? WHERE id = ?").run(body.status, id);
    return { ok: true };
  });

  app.get("/v1/admin/analytics", { preHandler: requireRoles("admin") }, async () => {
    const volume = db
      .prepare("SELECT COALESCE(SUM(gross_cents),0) as v FROM trades WHERE status = 'settled'")
      .get() as { v: number };
    const cross = db
      .prepare(
        "SELECT COALESCE(SUM(gross_cents),0) as v FROM trades WHERE status = 'settled' AND is_cross_network = 1"
      )
      .get() as { v: number };
    const platformFees = db
      .prepare("SELECT COALESCE(SUM(platform_fee_cents),0) as v FROM trades WHERE status = 'settled'")
      .get() as { v: number };
    const supply = db.prepare("SELECT COALESCE(SUM(balance_cents),0) as v FROM users").get() as {
      v: number;
    };
    const creditBacked = db
      .prepare("SELECT COALESCE(SUM(outstanding_cents),0) as v FROM credit_lines")
      .get() as { v: number };
    const exchanges = db.prepare("SELECT COUNT(*) as c FROM exchanges WHERE status = 'active'").get() as {
      c: number;
    };

    return {
      totalVolumeCents: volume.v,
      crossNetworkVolumeCents: cross.v,
      platformFeeRevenueCents: platformFees.v,
      tokenSupplyCents: supply.v,
      creditBackedCents: creditBacked.v,
      earnedCents: Math.max(0, supply.v - creditBacked.v),
      activeExchanges: exchanges.c,
    };
  });

  app.get("/v1/admin/audit", { preHandler: requireRoles("admin") }, async () => {
    const rows = db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100")
      .all();
    return { events: rows };
  });

  app.get("/v1/exchanges", async () => {
    const rows = db
      .prepare("SELECT id, name, slug, status, fee_bps FROM exchanges WHERE status = 'active'")
      .all();
    return { exchanges: rows };
  });
}
