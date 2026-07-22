# BarterChain — Complete Build Plan

**Version:** 1.0
**Split:** Blockchain developer builds §3 (contracts + test harness). Fable 5 builds §4–§6 (everything else).
**Strategy assumed:** Run your own exchange first (proves the system, zero adoption dependency), then open the rail to other operators. See §7.

---

## 1. What we're building, in one paragraph

A barter exchange platform where trade credits are an on-chain token (BRT) instead of ledger
entries in a vendor's database. Members get a mobile app with a marketplace, a directory, and
QR payments. Operators get a desktop back office with broker tooling, billing, and reporting.
The differentiator is that a member of Exchange A can pay a member of Exchange B instantly,
where today that requires a broker phone call and several days. BRT is pegged 1:1 to USD,
non-convertible to cash in Phase 1, and behaves like a trade dollar for tax purposes.

---

## 2. Decisions locked before anyone writes code

These were open. Here are the calls, with reasoning. Change them now if you disagree — changing
them after §3 ships is expensive.

| Decision | Call | Why |
|---|---|---|
| **Token decimals** | 2 | Trade dollars are dollars. 18 decimals invites float-precision bugs and confuses members. Store cents as integers. |
| **Peg** | 1 BRT = 1 USD, fixed, non-floating | IRS values a trade dollar at one dollar. A floating token is a security conversation you don't want. |
| **Credit lines** | Hybrid (Option C) — operator extends credit off-chain, tokens mint only on authorization | Preserves the mechanic that activates new members without putting negative balances or default risk into the token contract. Detail in §3.4. |
| **Fee model** | In-network 10% (operator's existing rate, unchanged). Cross-network 15%, split 10% operator / 5% platform. Plus operator SaaS. | Nobody's fee goes up unless they got something they couldn't get before. Self-selecting and defensible in an operator meeting. |
| **Operator SaaS** | $750/mo base, $1,500/mo above 500 members | ~2–4x the $395 incumbent cap, justified by mobile app + marketplace + interop. Predictable revenue that doesn't depend on volume. |
| **Staking APY** | **Cut from Phase 1 entirely** | Single feature most likely to reclassify BRT as a security. Buys nothing in a 30-member beta. Revisit post-counsel. |
| **Conversion bridge** | Phase 3, gated on legal | Converting a closed-loop credit to cash is the exact line the money-transmitter exemption sits on. |
| **Token supply** | Uncapped, mint/burn controlled | Supply must expand as trade volume grows. A fixed cap makes no sense for a trade credit. |
| **Chain** | Polygon PoS. Amoy testnet → mainnet. | Cheap, mature, well-supported by Thirdweb. Not a Supernet — unnecessary complexity for this scale. |
| **Freeze mechanism** | Custom transfer hook, operator-scoped | Operators must be able to freeze a member's balance for non-payment or fraud. Not standard ERC-20. |

**Revised revenue model** (replaces the one in your original doc):

| Stream | Rate | On $150k/mo volume across 5 exchanges |
|---|---|---|
| Operator SaaS | $750–1,500/mo per exchange | $3,750–7,500/mo |
| Cross-network fee (platform share) | 5% of cross-network volume | If 20% of volume goes cross-network: $1,500/mo |
| Promoted marketplace listings | $50–200/mo per operator | $250–1,000/mo |
| **Total** | | **~$5,500–10,000/mo** |

Lower than your original projection and considerably more defensible. The original model
extracted 5% of *all* GMV in cash from members, doubling their fee load — the number that
kills pilots. This one grows with operator count rather than by squeezing members.

---

## 3. Blockchain developer scope

Everything in this section is your developer's. Nothing here depends on Fable 5's work, and it
should be built and tested standalone first.

### 3.1 Deliverables

1. `BarterToken.sol` — the BRT token
2. `ExchangeRegistry.sol` — operator/network registry
3. `TradeSettlement.sol` — transaction execution and fee splitting
4. Full test suite (Foundry or Hardhat, ≥90% branch coverage)
5. Deployment scripts for Amoy testnet
6. A CLI or minimal script harness to exercise every function without a frontend
7. Written interface documentation for Fable 5 (ABIs, event signatures, revert reasons)

### 3.2 `BarterToken.sol`

ERC-20 base, with these deviations:

- **Decimals: 2**
- **Uncapped supply**, `mint()` restricted to `MINTER_ROLE`
- **`burn()`** restricted to `BURNER_ROLE`
- **Transfer hook** (`_beforeTokenTransfer` or ERC-20 `_update` override) enforcing:
  - Sender not frozen
  - Recipient not frozen
  - Sender's home exchange not suspended
  - Recipient's home exchange not suspended
- **`freeze(address)` / `unfreeze(address)`** — callable by the Super Admin, or by the operator
  of that member's home exchange only. Cross-operator freezing must revert.
- **Roles:** `DEFAULT_ADMIN_ROLE` (Safe multisig), `MINTER_ROLE`, `BURNER_ROLE`, `FREEZER_ROLE`
- **Pausable** — global halt for incident response
- No transfer fee logic in the token. Fees live in `TradeSettlement`. Keep the token dumb.

**Events:** `Minted`, `Burned`, `Frozen`, `Unfrozen`, plus standard `Transfer` / `Approval`.

### 3.3 `ExchangeRegistry.sol`

Maps exchanges (networks) and members.

```
struct Exchange {
    uint32  id;
    address operatorWallet;    // where operator fee share lands
    bool    active;
    uint16  inNetworkFeeBps;   // e.g. 1000 = 10%
    string  name;
}

mapping(uint32 => Exchange) exchanges;
mapping(address => uint32)  memberHomeExchange;  // 0 = unregistered
```

Functions:
- `registerExchange(...)` — Super Admin only
- `setExchangeActive(uint32, bool)` — Super Admin (suspension)
- `setInNetworkFee(uint32, uint16)` — operator of that exchange, capped at 2000 bps by admin
- `registerMember(address, uint32)` — operator of that exchange only
- `transferMember(address, uint32)` — Super Admin (member changes exchanges)
- View: `isSameExchange(address, address) → bool`

**This contract is what makes cross-network detection possible.** Everything else follows from it.

### 3.4 `TradeSettlement.sol`

The core. One function does the work:

```
function settleTrade(
    address buyer,
    address seller,
    uint256 grossAmount,
    bytes32 tradeRef
) external onlyRole(SETTLER_ROLE)
```

Logic:

1. Look up both parties' home exchanges from `ExchangeRegistry`
2. If same exchange → `feeBps = exchange.inNetworkFeeBps` (default 1000), **entire fee to operator**
3. If different exchanges → `feeBps = 1500`, split **1000 bps to seller's operator, 500 bps to platform treasury**
4. Fee is charged **seller-side only** (matches industry norm — buyers pay no fee)
5. Transfer `grossAmount` from buyer → seller
6. Transfer `fee` from seller → operator wallet(s) + treasury
7. Emit `TradeSettled(buyer, seller, grossAmount, fee, buyerExchange, sellerExchange, tradeRef)`

Reverts if: either party frozen, either exchange inactive, buyer balance insufficient,
`grossAmount` is zero, `tradeRef` already used (replay protection).

**Credit line handling (the hybrid model):**

Members don't go negative on-chain. Instead:

- Operator sets a member's credit limit in the *application* database, not the contract
- When a member wants to spend beyond their token balance, the backend checks the credit limit
- If within limit, the backend calls `mint()` for the shortfall to the member's wallet,
  records a debt row in Postgres, then calls `settleTrade()`
- When the member later earns BRT, the backend calls `burn()` against their balance to repay
  the debt, up to the outstanding amount
- The operator's collateral obligation and default risk stay entirely off-chain, where they
  already live today

This keeps the contracts simple and auditable while preserving the mutual-credit mechanic that
barter exchanges depend on. It also means a contract bug can't create phantom supply — every
mint is traceable to a specific credit authorization row.

**Additional functions:**
- `setPlatformFeeBps(uint16)` — Super Admin, capped at 1000
- `setTreasury(address)` — Super Admin
- `emergencyWithdraw()` — Super Admin, for stuck tokens

### 3.5 Security requirements

- OpenZeppelin contracts only for base implementations. No hand-rolled ERC-20.
- `ReentrancyGuard` on `settleTrade`
- All admin functions behind `AccessControl`, admin role held by a **Gnosis Safe 3-of-5** on mainnet
- Timelock (48h) on `setPlatformFeeBps`, `setTreasury`, and role grants
- No `delegatecall`, no upgradeable proxies in v1 — deploy immutable, migrate if needed.
  Proxies are the largest source of catastrophic bugs in this space and you don't need them yet.
- Slither and Mythril clean before handoff
- **Third-party audit before mainnet.** Budget $15–30k. Trail of Bits, OpenZeppelin, or Spearbit.
  This is not optional and it is not a place to save money.

### 3.6 Test harness

Your developer should deliver a script that, against Amoy testnet, can:

1. Deploy all three contracts
2. Register 3 exchanges with different fee rates
3. Register 10 members across those exchanges
4. Mint starting balances
5. Execute an in-network trade and assert fee routing
6. Execute a cross-network trade and assert the 10/5 split
7. Freeze a member, assert transfers revert
8. Suspend an exchange, assert its members can't trade
9. Simulate a credit-line mint → trade → earn → burn cycle
10. Print a summary table of all balances before and after

This harness is how you validate the economics before a single screen is designed.

### 3.7 Handoff to Fable 5

Your developer must deliver:
- Deployed Amoy addresses for all three contracts
- ABI JSON files
- A markdown doc listing every function, its access control, its events, and its revert conditions
- The test harness, runnable

---

## 4. Fable 5 scope — Backend

### 4.1 Stack

- **Node.js 20 + TypeScript**, Fastify
- **PostgreSQL** (Neon or Supabase) — primary datastore
- **Redis** (Upstash) — sessions, rate limiting, job queue
- **Thirdweb Engine** — transaction relaying and wallet management
- **Thirdweb In-App Wallets + Account Abstraction** — gasless for members, non-negotiable
- **Resend** (email) + **Twilio** (SMS)
- **Cloudflare R2** or S3 — listing images
- Hosted on **Railway** or **Render**

### 4.2 Data model

Core tables:

```
exchanges          id, name, slug, operator_wallet, chain_exchange_id, fee_bps,
                   status, branding_json, created_at

users              id, exchange_id, wallet_address, email, phone, business_name,
                   contact_name, role (member|broker|operator|admin),
                   tin_encrypted, status, wants_trade_flag, created_at

credit_lines       id, user_id, limit_cents, outstanding_cents, approved_by,
                   approved_at, status

listings           id, user_id, exchange_id, type (offer|want), title, description,
                   category_id, price_cents, payment_mode (full_trade|split),
                   cash_portion_pct, images_json, status, featured_until, created_at

categories         id, parent_id, name, slug, is_accommodation

trades             id, buyer_id, seller_id, gross_cents, fee_cents,
                   operator_fee_cents, platform_fee_cents, is_cross_network,
                   cash_portion_cents, tx_hash, trade_ref, status, listing_id,
                   broker_id, created_at

member_fees        id, user_id, period, cash_cents, trade_cents, status, paid_at

statements         id, user_id, period, opening_cents, closing_cents, pdf_url

audit_log          id, actor_id, action, target_type, target_id, payload_json, created_at
```

### 4.3 Critical backend behaviors

**Every trade follows this sequence. Do not deviate:**

1. Validate both parties active, not frozen
2. Compute cash portion (if split trade) and trade portion
3. Check buyer balance; if short, check credit line; if within limit, queue a credit mint
4. Write a `trades` row with status `pending` and a generated `trade_ref`
5. Call `settleTrade()` via Thirdweb Engine with that `trade_ref`
6. On `TradeSettled` event confirmation, update the row to `settled` with `tx_hash`
7. On revert or timeout, mark `failed` and surface a clear reason to both parties
8. Push-notify both parties

**Idempotency is mandatory.** The `trade_ref` prevents double-settlement. Every write endpoint
takes an idempotency key.

**Chain is the source of truth for balances.** Postgres caches them for query speed but a
reconciliation job runs hourly comparing cached balances against on-chain state and alerts on
any drift. Never show a member a balance that came only from Postgres.

**1099-B data capture from day one.** Collect and encrypt TIN at member onboarding. Aggregate
annual trade *sales* (not purchases) per member. Build the export in Phase 1 even though the
first filing is a year away — retrofitting tax data is miserable.

### 4.4 API surface

REST, versioned at `/v1`. Auth via JWT for members, session cookies for admin portals.

Groups: `/auth`, `/members`, `/listings`, `/trades`, `/directory`, `/wallet`, `/credit`,
`/statements`, `/operator/*`, `/admin/*`.

Rate limits: 100 req/min authenticated, 20 req/min for search, 5 req/min for trade creation.

---

## 5. Fable 5 scope — Member mobile app

**React Native via Expo. iOS and Android. Mobile only — no member web app in Phase 1.**

### 5.1 Screens

| Screen | Contents |
|---|---|
| **Onboarding** | Email/phone entry → OTP → business profile → Thirdweb wallet created silently in background. Member never sees a seed phrase, never hears the word "wallet." |
| **Home** | Balance (large, in dollars — "$4,250 trade" not "4250 BRT"), credit available, recent activity, featured local + national listings |
| **Marketplace** | Tabs: New (72h) / All / Wanted. Filters: category, distance, full-trade vs split, my exchange vs all exchanges. Card grid with photos. |
| **Listing detail** | Photos, description, price, payment mode, seller business card, distance, "Contact seller" and "Pay now" |
| **Directory** | Search by business name, category browse, geo-radius search, "Really wants trade" filter, exchange filter |
| **Accommodations** | Dedicated vertical. Map + list, filter by state/country/dates. This is where cross-network volume will concentrate. |
| **Pay** | Scan QR → amount entry → fee preview (**must show cross-network fee difference clearly before confirm**) → biometric confirm → receipt |
| **Receive** | Member's QR code, optional preset amount |
| **Activity** | Transaction list, filterable, tap for receipt detail |
| **My listings** | Create/edit/pause listings, photo upload, view interest |
| **Profile** | Business info, "I really want trade" toggle, notification settings, statements, support |

### 5.2 Non-negotiable UX rules

- **The word "crypto" never appears.** Not in the app, not in onboarding, not in support copy.
  Members are business owners who want to trade, not investors. "Trade dollars" throughout.
- **Balances display as dollars.** `$4,250.00`, never `4250 BRT`.
- **Members never see: seed phrases, gas, private keys, transaction hashes, contract addresses.**
  If a member can see a hex string, something has gone wrong.
- **Fee transparency before confirm.** If a payment is cross-network and costs 15% instead of 10%,
  the confirm screen says so in plain language with both numbers.
- **Offline-tolerant.** Cache the directory and recent listings. Barter happens in restaurants
  and job sites with bad signal.

---

## 6. Fable 5 scope — Desktop portals

### 6.1 Operator portal

The single most important surface for adoption. If operators don't like this, nothing else matters.

**Dashboard:** today's volume, active members, pending approvals, fee revenue MTD,
cross-network activity, accounts needing attention (negative trending, inactive 90d, over-credit).

**Members:** table with search/filter/sort. Per member: profile, balance, credit line, trade
history, assigned broker, statements, freeze/unfreeze, adjust credit limit, notes.

**Broker workspace** — this is the feature the incumbent has and most crypto projects forget:
- Members assigned to each broker
- Members with high positive balances (need help spending)
- Members with high negative balances (need to sell)
- Open "wants" that no listing satisfies — the broker's sourcing queue
- Contact log per member

**Manual transaction entry.** Operators take trades by phone constantly. A form: buyer, seller,
amount, cash split, notes. Posts through the same settlement path with the broker recorded.

**Billing:** monthly member fees (cash and trade), invoice generation, payment recording,
delinquency list, Stripe integration for cash collection.

**Listings moderation:** approve/reject, feature a listing, remove.

**Reporting:** transaction register, fee reconciliation, member statements, volume by category,
cross-network breakdown, exportable to CSV and PDF.

**Branding:** logo, colors, member agreement, policies — the white-label controls the incumbent has.

### 6.2 Super Admin portal

Exchange registry (approve/suspend), platform fee configuration, treasury view, cross-network
volume analytics, token supply dashboard (minted, burned, outstanding, credit-backed vs earned),
global audit log, operator account management, incident controls (pause contract, freeze member).

---

## 7. Phasing

### Phase 0 — Foundations (Weeks 1–3)
**You:** open all accounts (Thirdweb, Alchemy, Stripe, Resend, Twilio, Expo, Railway, Neon,
Upstash, Apple Developer, Google Play). Fund a deployer wallet with Amoy MATIC. Create the Safe.
**Developer:** contracts written and unit-tested locally.
**Fable 5:** repo scaffolding, database schema, auth, Thirdweb wallet integration proof.

### Phase 1 — Testnet MVP (Weeks 4–12)
**Developer:** contracts deployed to Amoy, test harness delivered, handoff doc written.
**Fable 5:** full backend, member app, operator portal, super admin portal — everything in §4–6.
**Exit criteria:** 100 test trades executed across 3 simulated exchanges, including cross-network
and credit-line flows, with zero balance drift between chain and database.

### Phase 2 — Your own exchange, mainnet (Weeks 13–24)
You operate the first exchange. 20–30 real members recruited from your existing barter
relationships. Real goods, real services, real money.
**Gate before mainnet:** third-party contract audit complete and findings resolved.
**Exit criteria:** 90 days of live trading, $50k+ cumulative volume, no critical incidents,
members using the marketplace organically rather than being prompted.

### Phase 3 — Second operator (Months 7–10)
Onboard one external exchange. This is the real test — the first cross-network trade between two
independently operated exchanges. Price at the operator SaaS rate with a discount for being first.
**Exit criteria:** cross-network volume exceeding 15% of total.

### Phase 4 — Scale and legal review (Months 11–18)
3–5 more operators. In parallel: securities and money-transmitter counsel review the conversion
bridge and any yield features. **Nothing from that category ships before written opinions.**

---

## 8. What you need to do this week

1. **Get IRTA's advisory memos** — the *Cryptocurrency Money Transmitter* memo and the
   *Membership Cash Conversion & Lending Clauses* memo. Join IRTA if that's what it takes; the
   membership fee is trivial against what those documents save you in legal time.
2. **Decide whether you're running your own exchange.** This plan assumes yes. If no, §7 changes
   substantially and you need a named first operator before Phase 1 starts.
3. **Confirm the fee model in §2** with one real operator before it's built. A twenty-minute
   conversation now prevents a rewrite later.
4. **Open the accounts in Phase 0.** Nothing starts until these exist.
5. **Budget the audit.** $15–30k, needed by Week 20.

---

## 9. Handoff summary

**To your blockchain developer:** §2 (decisions), §3 (complete scope). Deliver contracts, tests,
Amoy deployment, and the interface doc before Fable 5 needs to integrate — target Week 6.

**To Fable 5:** §2 (decisions), §4, §5, §6, and the interface doc from your developer. Build
against the Amoy deployment. Do not proceed to member-facing polish until the reconciliation job
in §4.3 is green.

**To you:** §8.
