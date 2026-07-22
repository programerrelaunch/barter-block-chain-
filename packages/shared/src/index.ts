export type UserRole = "member" | "broker" | "operator" | "admin";
export type ListingType = "offer" | "want";
export type PaymentMode = "full_trade" | "split";
export type TradeStatus = "pending" | "settled" | "failed";
export type CreditStatus = "active" | "suspended" | "closed";
export type ExchangeStatus = "active" | "suspended";

export interface Exchange {
  id: string;
  name: string;
  slug: string;
  operatorWallet: string;
  chainExchangeId: number;
  feeBps: number;
  status: ExchangeStatus;
  brandingJson: Record<string, unknown>;
  createdAt: string;
}

export interface User {
  id: string;
  exchangeId: string;
  walletAddress: string;
  email: string;
  phone: string | null;
  businessName: string;
  contactName: string;
  role: UserRole;
  status: "active" | "frozen" | "inactive";
  wantsTradeFlag: boolean;
  balanceCents: number;
  createdAt: string;
}

export interface CreditLine {
  id: string;
  userId: string;
  limitCents: number;
  outstandingCents: number;
  approvedBy: string | null;
  approvedAt: string | null;
  status: CreditStatus;
}

export interface Listing {
  id: string;
  userId: string;
  exchangeId: string;
  type: ListingType;
  title: string;
  description: string;
  categoryId: string | null;
  priceCents: number;
  paymentMode: PaymentMode;
  cashPortionPct: number;
  imagesJson: string[];
  status: "active" | "paused" | "removed";
  featuredUntil: string | null;
  createdAt: string;
  businessName?: string;
  distanceMiles?: number;
}

export interface Trade {
  id: string;
  buyerId: string;
  sellerId: string;
  grossCents: number;
  feeCents: number;
  operatorFeeCents: number;
  platformFeeCents: number;
  isCrossNetwork: boolean;
  cashPortionCents: number;
  txHash: string | null;
  tradeRef: string;
  status: TradeStatus;
  listingId: string | null;
  brokerId: string | null;
  createdAt: string;
}

export interface FeePreview {
  grossCents: number;
  feeBps: number;
  feeCents: number;
  sellerNetCents: number;
  isCrossNetwork: boolean;
  inNetworkFeeBps: number;
  crossNetworkFeeBps: number;
  message: string;
}

export const IN_NETWORK_FEE_BPS = 1000;
export const CROSS_NETWORK_FEE_BPS = 1500;
export const PLATFORM_FEE_BPS = 500;
export const OPERATOR_CROSS_FEE_BPS = 1000;

export function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function computeFeePreview(input: {
  grossCents: number;
  isCrossNetwork: boolean;
  inNetworkFeeBps?: number;
}): FeePreview {
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
