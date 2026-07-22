# BarterChain

Trade-credit exchange platform: on-chain BRT (pegged 1:1 to USD), member mobile app, and operator back office.

## What's in this repo

| Path | Purpose |
|---|---|
| `packages/contracts` | `BarterToken`, `ExchangeRegistry`, `TradeSettlement` (Hardhat) |
| `apps/api` | Fastify API + SQLite (local stand-in for Postgres) |
| `apps/web` | Operator + Super Admin portal |
| `apps/mobile` | Expo member app |
| `packages/shared` | Shared types + fee math |

## Quick start

```bash
npm install
npm run db:seed
npm run dev:api        # http://localhost:4000
npm run dev:web        # http://localhost:5173
npm run dev:mobile     # Expo
```

## Deploy (Vercel)

The operator web app + serverless `/v1` API deploy from the repo root.

```bash
npx vercel --prod
```

Demo logins work on the deployed site the same as local. Serverless state resets on cold starts (demo only — wire Postgres/Neon for production).

### Demo logins

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@barterchain.local` | `admin123` |
| Operator | `operator@baybarter.local` | `operator123` |
| Member (Bay Area) | `hello@coastalcafe.local` | `member123` |
| Member (Pacific) | `stay@redwoodlodge.local` | `member123` |

### Contracts

```bash
npm run contracts:compile
npm run contracts:test
npm run contracts:deploy:local
npm run harness -w @barterchain/contracts
```

## Design rules baked in

- Members see **trade dollars** (`$4,250.00`), never "crypto", gas, or hex.
- Seller-side fees: **10% in-network**, **15% cross-network** (10% operator / 5% platform).
- Credit lines are off-chain; the API mints the shortfall, then settles, then burns on repay.
- Chain is the intended source of truth for balances; local mode simulates settlement until Thirdweb Engine is wired.

## Phase note

This is a runnable Phase 0/1 foundation. Production still needs: Thirdweb AA wallets, Neon/Postgres, Redis, Amoy deploy + audit, Expo store builds, and Stripe billing.
