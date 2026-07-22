export const IN_NETWORK_FEE_BPS = 1000;
export const CROSS_NETWORK_FEE_BPS = 1500;
export const PLATFORM_FEE_BPS = 500;
export const OPERATOR_CROSS_FEE_BPS = 1000;

function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function computeFeePreview(input: {
  grossCents: number;
  isCrossNetwork: boolean;
  inNetworkFeeBps?: number;
}) {
  const inNetworkFeeBps = input.inNetworkFeeBps ?? IN_NETWORK_FEE_BPS;
  const feeBps = input.isCrossNetwork ? CROSS_NETWORK_FEE_BPS : inNetworkFeeBps;
  const feeCents = Math.round((input.grossCents * feeBps) / 10000);
  const sellerNetCents = input.grossCents - feeCents;
  const message = input.isCrossNetwork
    ? `This is a cross-network trade. Seller fee is ${(feeBps / 100).toFixed(0)}% (${centsToDollars(feeCents)}) instead of the in-network ${(inNetworkFeeBps / 100).toFixed(0)}%.`
    : `In-network seller fee: ${(feeBps / 100).toFixed(0)}% (${centsToDollars(feeCents)}).`;
  return {
    grossCents: input.grossCents,
    feeBps,
    feeCents,
    sellerNetCents,
    isCrossNetwork: input.isCrossNetwork,
    inNetworkFeeBps,
    crossNetworkFeeBps: CROSS_NETWORK_FEE_BPS,
    message,
  };
}

export type User = {
  id: string;
  exchange_id: string;
  wallet_address: string;
  email: string;
  phone: string | null;
  business_name: string;
  contact_name: string;
  role: string;
  password_hash: string;
  status: string;
  wants_trade_flag: boolean;
  balance_cents: number;
  created_at: string;
};

export type Exchange = {
  id: string;
  name: string;
  slug: string;
  operator_wallet: string;
  chain_exchange_id: number;
  fee_bps: number;
  status: string;
};

export type CreditLine = {
  id: string;
  user_id: string;
  limit_cents: number;
  outstanding_cents: number;
  status: string;
};

export type Listing = {
  id: string;
  user_id: string;
  exchange_id: string;
  type: string;
  title: string;
  description: string;
  category_id: string | null;
  price_cents: number;
  payment_mode: string;
  cash_portion_pct: number;
  images_json: string[];
  status: string;
  featured_until: string | null;
  created_at: string;
};

export type Trade = {
  id: string;
  buyer_id: string;
  seller_id: string;
  gross_cents: number;
  fee_cents: number;
  operator_fee_cents: number;
  platform_fee_cents: number;
  is_cross_network: boolean;
  cash_portion_cents: number;
  tx_hash: string | null;
  trade_ref: string;
  status: string;
  listing_id: string | null;
  broker_id: string | null;
  created_at: string;
};

export type Store = {
  exchanges: Exchange[];
  users: User[];
  creditLines: CreditLine[];
  listings: Listing[];
  trades: Trade[];
  categories: { id: string; name: string; slug: string; is_accommodation: boolean }[];
  audit: { id: string; action: string; target_type: string; target_id: string; created_at: string; payload_json: string }[];
  idempotency: Record<string, unknown>;
};

declare global {
  // Persist across warm serverless invocations on the same instance
  // eslint-disable-next-line no-var
  var __barterStore: Store | undefined;
}

function hashPassword(pw: string): string {
  return `demo:${Buffer.from(pw).toString("base64")}`;
}

export function verifyPassword(stored: string, pw: string): boolean {
  return stored === hashPassword(pw);
}

function seed(): Store {
  const now = new Date().toISOString();
  return {
    exchanges: [
      {
        id: "ex_bay",
        name: "Bay Area Barter",
        slug: "bay-area",
        operator_wallet: "0x0000000000000000000000000000000000000b01",
        chain_exchange_id: 1,
        fee_bps: 1000,
        status: "active",
      },
      {
        id: "ex_pacific",
        name: "Pacific Trade Exchange",
        slug: "pacific",
        operator_wallet: "0x0000000000000000000000000000000000000b02",
        chain_exchange_id: 2,
        fee_bps: 1000,
        status: "active",
      },
      {
        id: "ex_desert",
        name: "Desert Mutual",
        slug: "desert",
        operator_wallet: "0x0000000000000000000000000000000000000b03",
        chain_exchange_id: 3,
        fee_bps: 1000,
        status: "active",
      },
    ],
    users: [
      {
        id: "usr_admin",
        exchange_id: "ex_bay",
        wallet_address: "0x00000000000000000000000000000000000000a1",
        email: "admin@barterchain.local",
        phone: "+15555550100",
        business_name: "BarterChain Platform",
        contact_name: "Platform Admin",
        role: "admin",
        password_hash: hashPassword("admin123"),
        status: "active",
        wants_trade_flag: false,
        balance_cents: 0,
        created_at: now,
      },
      {
        id: "usr_op_bay",
        exchange_id: "ex_bay",
        wallet_address: "0x0000000000000000000000000000000000000b01",
        email: "operator@baybarter.local",
        phone: "+15555550100",
        business_name: "Bay Area Barter HQ",
        contact_name: "Sam Operator",
        role: "operator",
        password_hash: hashPassword("operator123"),
        status: "active",
        wants_trade_flag: false,
        balance_cents: 0,
        created_at: now,
      },
      {
        id: "usr_broker",
        exchange_id: "ex_bay",
        wallet_address: "0x0000000000000000000000000000000000000b11",
        email: "broker@baybarter.local",
        phone: "+15555550100",
        business_name: "Bay Broker Desk",
        contact_name: "Blake Broker",
        role: "broker",
        password_hash: hashPassword("broker123"),
        status: "active",
        wants_trade_flag: false,
        balance_cents: 0,
        created_at: now,
      },
      {
        id: "usr_cafe",
        exchange_id: "ex_bay",
        wallet_address: "0x0000000000000000000000000000000000000c01",
        email: "hello@coastalcafe.local",
        phone: "+15555550100",
        business_name: "Coastal Cafe",
        contact_name: "Maya Chen",
        role: "member",
        password_hash: hashPassword("member123"),
        status: "active",
        wants_trade_flag: true,
        balance_cents: 425_000,
        created_at: now,
      },
      {
        id: "usr_print",
        exchange_id: "ex_bay",
        wallet_address: "0x0000000000000000000000000000000000000c02",
        email: "jobs@printworks.local",
        phone: "+15555550100",
        business_name: "PrintWorks Studio",
        contact_name: "Jordan Lee",
        role: "member",
        password_hash: hashPassword("member123"),
        status: "active",
        wants_trade_flag: true,
        balance_cents: 180_000,
        created_at: now,
      },
      {
        id: "usr_lodge",
        exchange_id: "ex_pacific",
        wallet_address: "0x0000000000000000000000000000000000000c03",
        email: "stay@redwoodlodge.local",
        phone: "+15555550100",
        business_name: "Redwood Lodge",
        contact_name: "Alex Rivera",
        role: "member",
        password_hash: hashPassword("member123"),
        status: "active",
        wants_trade_flag: true,
        balance_cents: 890_000,
        created_at: now,
      },
      {
        id: "usr_hvac",
        exchange_id: "ex_desert",
        wallet_address: "0x0000000000000000000000000000000000000c04",
        email: "service@desertair.local",
        phone: "+15555550100",
        business_name: "Desert Air HVAC",
        contact_name: "Chris Najafi",
        role: "member",
        password_hash: hashPassword("member123"),
        status: "active",
        wants_trade_flag: true,
        balance_cents: 95_000,
        created_at: now,
      },
    ],
    creditLines: [
      { id: "cl1", user_id: "usr_cafe", limit_cents: 500_000, outstanding_cents: 0, status: "active" },
      { id: "cl2", user_id: "usr_print", limit_cents: 250_000, outstanding_cents: 0, status: "active" },
      { id: "cl3", user_id: "usr_hvac", limit_cents: 300_000, outstanding_cents: 50_000, status: "active" },
    ],
    categories: [
      { id: "cat_food", name: "Food & Beverage", slug: "food", is_accommodation: false },
      { id: "cat_prof", name: "Professional Services", slug: "professional", is_accommodation: false },
      { id: "cat_home", name: "Home & Construction", slug: "home", is_accommodation: false },
      { id: "cat_travel", name: "Travel & Accommodations", slug: "accommodations", is_accommodation: true },
      { id: "cat_health", name: "Health & Wellness", slug: "health", is_accommodation: false },
    ],
    listings: [
      {
        id: "lst1",
        user_id: "usr_cafe",
        exchange_id: "ex_bay",
        type: "offer",
        title: "Catering for 20 — breakfast spread",
        description: "Pastries, coffee, fruit, and breakfast sandwiches delivered within 15 miles.",
        category_id: "cat_food",
        price_cents: 45_000,
        payment_mode: "full_trade",
        cash_portion_pct: 0,
        images_json: [],
        status: "active",
        featured_until: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: now,
      },
      {
        id: "lst2",
        user_id: "usr_print",
        exchange_id: "ex_bay",
        type: "offer",
        title: "Business card package (500)",
        description: "Full-color, double-sided cards on heavy stock. 3-day turnaround.",
        category_id: "cat_prof",
        price_cents: 12_500,
        payment_mode: "full_trade",
        cash_portion_pct: 0,
        images_json: [],
        status: "active",
        featured_until: null,
        created_at: now,
      },
      {
        id: "lst3",
        user_id: "usr_lodge",
        exchange_id: "ex_pacific",
        type: "offer",
        title: "Two-night forest cabin stay",
        description: "Midweek stay for two. Kitchenette, trail access, quiet evenings.",
        category_id: "cat_travel",
        price_cents: 320_000,
        payment_mode: "full_trade",
        cash_portion_pct: 0,
        images_json: [],
        status: "active",
        featured_until: new Date(Date.now() + 14 * 86400000).toISOString(),
        created_at: now,
      },
      {
        id: "lst4",
        user_id: "usr_hvac",
        exchange_id: "ex_desert",
        type: "want",
        title: "Looking for website redesign",
        description: "Need a clean service-business site with booking form. Prefer full trade.",
        category_id: "cat_prof",
        price_cents: 200_000,
        payment_mode: "full_trade",
        cash_portion_pct: 0,
        images_json: [],
        status: "active",
        featured_until: null,
        created_at: now,
      },
      {
        id: "lst5",
        user_id: "usr_cafe",
        exchange_id: "ex_bay",
        type: "want",
        title: "Need plumbing repair — kitchen line",
        description: "Slow drain and possible leak under prep sink. Can pay full trade.",
        category_id: "cat_home",
        price_cents: 75_000,
        payment_mode: "full_trade",
        cash_portion_pct: 0,
        images_json: [],
        status: "active",
        featured_until: null,
        created_at: now,
      },
    ],
    trades: [],
    audit: [],
    idempotency: {},
  };
}

export function getStore(): Store {
  if (!globalThis.__barterStore) {
    globalThis.__barterStore = seed();
  }
  return globalThis.__barterStore;
}

export function mapUser(u: User) {
  return {
    id: u.id,
    exchangeId: u.exchange_id,
    walletAddress: u.wallet_address,
    email: u.email,
    phone: u.phone,
    businessName: u.business_name,
    contactName: u.contact_name,
    role: u.role,
    status: u.status,
    wantsTradeFlag: u.wants_trade_flag,
    balanceCents: u.balance_cents,
    createdAt: u.created_at,
  };
}

export function settleTrade(
  store: Store,
  input: {
    buyerId: string;
    sellerId: string;
    grossCents: number;
    cashPortionCents?: number;
    listingId?: string | null;
    brokerId?: string | null;
    tradeRef?: string;
  }
) {
  if (input.grossCents <= 0) throw Object.assign(new Error("grossAmount must be greater than zero"), { statusCode: 400 });

  const buyer = store.users.find((u) => u.id === input.buyerId);
  const seller = store.users.find((u) => u.id === input.sellerId);
  if (!buyer || !seller) throw Object.assign(new Error("Buyer or seller not found"), { statusCode: 404 });
  if (buyer.status !== "active" || seller.status !== "active") {
    throw Object.assign(new Error("Both parties must be active and unfrozen"), { statusCode: 400 });
  }
  if (buyer.id === seller.id) throw Object.assign(new Error("Cannot trade with yourself"), { statusCode: 400 });

  const buyerEx = store.exchanges.find((e) => e.id === buyer.exchange_id)!;
  const sellerEx = store.exchanges.find((e) => e.id === seller.exchange_id)!;
  if (buyerEx.status !== "active" || sellerEx.status !== "active") {
    throw Object.assign(new Error("One or both exchanges are suspended"), { statusCode: 400 });
  }

  const isCrossNetwork = buyer.exchange_id !== seller.exchange_id;
  const tradePortion = input.grossCents - (input.cashPortionCents ?? 0);
  const preview = computeFeePreview({
    grossCents: tradePortion,
    isCrossNetwork,
    inNetworkFeeBps: sellerEx.fee_bps,
  });

  const tradeRef = input.tradeRef ?? `tr_${Math.random().toString(36).slice(2, 12)}`;
  if (store.trades.some((t) => t.trade_ref === tradeRef)) {
    throw Object.assign(new Error("trade_ref already used"), { statusCode: 409 });
  }

  const credit = store.creditLines.find((c) => c.user_id === buyer.id && c.status === "active");
  let mintCents = 0;
  if (buyer.balance_cents < tradePortion) {
    const shortfall = tradePortion - buyer.balance_cents;
    const room = credit ? credit.limit_cents - credit.outstanding_cents : 0;
    if (shortfall > room) {
      throw Object.assign(
        new Error(`Insufficient trade dollars. Need $${(shortfall / 100).toFixed(2)} more than available credit.`),
        { statusCode: 400 }
      );
    }
    mintCents = shortfall;
    buyer.balance_cents += mintCents;
    if (credit) credit.outstanding_cents += mintCents;
  }

  const operatorFeeCents = isCrossNetwork
    ? Math.round((tradePortion * OPERATOR_CROSS_FEE_BPS) / 10000)
    : preview.feeCents;
  const platformFeeCents = isCrossNetwork
    ? Math.round((tradePortion * PLATFORM_FEE_BPS) / 10000)
    : 0;

  buyer.balance_cents -= tradePortion;
  seller.balance_cents += tradePortion;
  seller.balance_cents -= preview.feeCents;

  const opUser = store.users.find(
    (u) => u.wallet_address.toLowerCase() === sellerEx.operator_wallet.toLowerCase()
  );
  if (opUser && operatorFeeCents > 0) opUser.balance_cents += operatorFeeCents;

  const sellerCredit = store.creditLines.find((c) => c.user_id === seller.id && c.outstanding_cents > 0);
  if (sellerCredit) {
    const repay = Math.min(seller.balance_cents, sellerCredit.outstanding_cents);
    if (repay > 0) {
      seller.balance_cents -= repay;
      sellerCredit.outstanding_cents -= repay;
    }
  }

  const trade: Trade = {
    id: `t_${Math.random().toString(36).slice(2, 10)}`,
    buyer_id: buyer.id,
    seller_id: seller.id,
    gross_cents: tradePortion,
    fee_cents: preview.feeCents,
    operator_fee_cents: operatorFeeCents,
    platform_fee_cents: platformFeeCents,
    is_cross_network: isCrossNetwork,
    cash_portion_cents: input.cashPortionCents ?? 0,
    tx_hash: `0xsim${Math.random().toString(16).slice(2)}`,
    trade_ref: tradeRef,
    status: "settled",
    listing_id: input.listingId ?? null,
    broker_id: input.brokerId ?? null,
    created_at: new Date().toISOString(),
  };
  store.trades.unshift(trade);
  store.audit.unshift({
    id: `a_${Date.now()}`,
    action: "trade_settled",
    target_type: "trade",
    target_id: trade.id,
    created_at: trade.created_at,
    payload_json: JSON.stringify({ tradeRef, isCrossNetwork }),
  });

  return {
    id: trade.id,
    tradeRef,
    txHash: trade.tx_hash,
    status: "settled" as const,
    ...preview,
    operatorFeeCents,
    platformFeeCents,
    mintCents,
  };
}
