import { nanoid } from "nanoid";
import {
  computeFeePreview,
  OPERATOR_CROSS_FEE_BPS,
  PLATFORM_FEE_BPS,
} from "@barterchain/shared";
import { db } from "../db/schema";

type UserRow = {
  id: string;
  exchange_id: string;
  wallet_address: string;
  status: string;
  balance_cents: number;
  business_name: string;
};

type CreditRow = {
  id: string;
  limit_cents: number;
  outstanding_cents: number;
  status: string;
};

/**
 * Local settlement engine.
 * In production this calls TradeSettlement.settleTrade via Thirdweb Engine.
 * Chain remains source of truth; here we simulate mint/burn/settle and keep
 * Postgres (SQLite) balances reconciled in the same transaction.
 */
export class SettlementService {
  settleTrade(input: {
    buyerId: string;
    sellerId: string;
    grossCents: number;
    cashPortionCents?: number;
    listingId?: string | null;
    brokerId?: string | null;
    tradeRef?: string;
  }) {
    if (input.grossCents <= 0) {
      throw Object.assign(new Error("grossAmount must be greater than zero"), { statusCode: 400 });
    }

    const buyer = db.prepare("SELECT * FROM users WHERE id = ?").get(input.buyerId) as UserRow | undefined;
    const seller = db.prepare("SELECT * FROM users WHERE id = ?").get(input.sellerId) as UserRow | undefined;
    if (!buyer || !seller) {
      throw Object.assign(new Error("Buyer or seller not found"), { statusCode: 404 });
    }
    if (buyer.status !== "active" || seller.status !== "active") {
      throw Object.assign(new Error("Both parties must be active and unfrozen"), { statusCode: 400 });
    }
    if (buyer.id === seller.id) {
      throw Object.assign(new Error("Cannot trade with yourself"), { statusCode: 400 });
    }

    const buyerEx = db.prepare("SELECT * FROM exchanges WHERE id = ?").get(buyer.exchange_id) as {
      id: string;
      fee_bps: number;
      status: string;
      operator_wallet: string;
    };
    const sellerEx = db.prepare("SELECT * FROM exchanges WHERE id = ?").get(seller.exchange_id) as {
      id: string;
      fee_bps: number;
      status: string;
      operator_wallet: string;
    };

    if (buyerEx.status !== "active" || sellerEx.status !== "active") {
      throw Object.assign(new Error("One or both exchanges are suspended"), { statusCode: 400 });
    }

    const isCrossNetwork = buyer.exchange_id !== seller.exchange_id;
    const tradePortion = input.grossCents - (input.cashPortionCents ?? 0);
    if (tradePortion <= 0) {
      throw Object.assign(new Error("Trade portion must be greater than zero"), { statusCode: 400 });
    }

    const preview = computeFeePreview({
      grossCents: tradePortion,
      isCrossNetwork,
      inNetworkFeeBps: sellerEx.fee_bps,
    });

    const tradeRef = input.tradeRef ?? `tr_${nanoid(16)}`;
    const existing = db.prepare("SELECT id FROM trades WHERE trade_ref = ?").get(tradeRef);
    if (existing) {
      throw Object.assign(new Error("trade_ref already used"), { statusCode: 409 });
    }

    const credit = db
      .prepare("SELECT * FROM credit_lines WHERE user_id = ? AND status = 'active'")
      .get(buyer.id) as CreditRow | undefined;

    let mintCents = 0;
    const available = buyer.balance_cents;
    if (available < tradePortion) {
      const shortfall = tradePortion - available;
      const room = credit ? credit.limit_cents - credit.outstanding_cents : 0;
      if (shortfall > room) {
        throw Object.assign(
          new Error(
            `Insufficient trade dollars. Need $${(shortfall / 100).toFixed(2)} more than available credit.`
          ),
          { statusCode: 400 }
        );
      }
      mintCents = shortfall;
    }

    const operatorFeeCents = isCrossNetwork
      ? Math.round((tradePortion * OPERATOR_CROSS_FEE_BPS) / 10000)
      : preview.feeCents;
    const platformFeeCents = isCrossNetwork
      ? Math.round((tradePortion * PLATFORM_FEE_BPS) / 10000)
      : 0;

    const tradeId = nanoid();
    const now = new Date().toISOString();
    const txHash = `0xsim${nanoid(40)}`;

    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO trades (
          id, buyer_id, seller_id, gross_cents, fee_cents, operator_fee_cents, platform_fee_cents,
          is_cross_network, cash_portion_cents, tx_hash, trade_ref, status, listing_id, broker_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending', ?, ?, ?)`
      ).run(
        tradeId,
        buyer.id,
        seller.id,
        tradePortion,
        preview.feeCents,
        operatorFeeCents,
        platformFeeCents,
        isCrossNetwork ? 1 : 0,
        input.cashPortionCents ?? 0,
        tradeRef,
        input.listingId ?? null,
        input.brokerId ?? null,
        now
      );

      if (mintCents > 0 && credit) {
        db.prepare(
          "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?"
        ).run(mintCents, buyer.id);
        db.prepare(
          "UPDATE credit_lines SET outstanding_cents = outstanding_cents + ? WHERE id = ?"
        ).run(mintCents, credit.id);
        this.audit(null, "credit_mint", "user", buyer.id, { mintCents, tradeRef });
      }

      // buyer → seller (gross)
      db.prepare("UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?").run(
        tradePortion,
        buyer.id
      );
      db.prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?").run(
        tradePortion,
        seller.id
      );

      // seller → fees
      db.prepare("UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?").run(
        preview.feeCents,
        seller.id
      );

      // Operator fee credited to exchange operator wallet user if present
      const opUser = db
        .prepare("SELECT id FROM users WHERE wallet_address = ? COLLATE NOCASE")
        .get(sellerEx.operator_wallet) as { id: string } | undefined;
      if (opUser && operatorFeeCents > 0) {
        db.prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?").run(
          operatorFeeCents,
          opUser.id
        );
      }

      // Auto-repay credit from seller earnings (hybrid model)
      if (credit && mintCents === 0) {
        // buyer may still have outstanding — repay when they earn
      }
      const sellerCredit = db
        .prepare("SELECT * FROM credit_lines WHERE user_id = ? AND outstanding_cents > 0")
        .get(seller.id) as CreditRow | undefined;
      if (sellerCredit) {
        const sellerBal = (
          db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(seller.id) as {
            balance_cents: number;
          }
        ).balance_cents;
        const repay = Math.min(sellerBal, sellerCredit.outstanding_cents);
        if (repay > 0) {
          db.prepare("UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?").run(
            repay,
            seller.id
          );
          db.prepare(
            "UPDATE credit_lines SET outstanding_cents = outstanding_cents - ? WHERE id = ?"
          ).run(repay, sellerCredit.id);
          this.audit(null, "credit_burn", "user", seller.id, { repayCents: repay, tradeRef });
        }
      }

      db.prepare(
        "UPDATE trades SET status = 'settled', tx_hash = ? WHERE id = ?"
      ).run(txHash, tradeId);

      this.audit(null, "trade_settled", "trade", tradeId, {
        tradeRef,
        isCrossNetwork,
        grossCents: tradePortion,
        feeCents: preview.feeCents,
      });
    });

    run();

    return {
      id: tradeId,
      tradeRef,
      txHash,
      status: "settled" as const,
      ...preview,
      operatorFeeCents,
      platformFeeCents,
      mintCents,
    };
  }

  preview(buyerId: string, sellerId: string, grossCents: number) {
    const buyer = db.prepare("SELECT * FROM users WHERE id = ?").get(buyerId) as UserRow;
    const seller = db.prepare("SELECT * FROM users WHERE id = ?").get(sellerId) as UserRow;
    if (!buyer || !seller) {
      throw Object.assign(new Error("Buyer or seller not found"), { statusCode: 404 });
    }
    const sellerEx = db.prepare("SELECT fee_bps FROM exchanges WHERE id = ?").get(seller.exchange_id) as {
      fee_bps: number;
    };
    return computeFeePreview({
      grossCents,
      isCrossNetwork: buyer.exchange_id !== seller.exchange_id,
      inNetworkFeeBps: sellerEx.fee_bps,
    });
  }

  private audit(
    actorId: string | null,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>
  ) {
    db.prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(), actorId, action, targetType, targetId, JSON.stringify(payload), new Date().toISOString());
  }
}

export const settlementService = new SettlementService();
