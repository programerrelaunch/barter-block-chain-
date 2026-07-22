import { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/schema";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  exchangeId: string;
  businessName: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}

export function getUserRow(userId: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
}

export function mapUser(row: any) {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    walletAddress: row.wallet_address,
    email: row.email,
    phone: row.phone,
    businessName: row.business_name,
    contactName: row.contact_name,
    role: row.role,
    status: row.status,
    wantsTradeFlag: !!row.wants_trade_flag,
    balanceCents: row.balance_cents,
    createdAt: row.created_at,
  };
}
