# Contract interface handoff

## Contracts

1. `ExchangeRegistry` — networks + member home exchange
2. `BarterToken` (BRT) — 2 decimals, mint/burn/freeze/pause
3. `TradeSettlement` — `settleTrade(buyer, seller, grossAmount, tradeRef)`

## Roles

| Contract | Role | Who |
|---|---|---|
| All | `DEFAULT_ADMIN_ROLE` | Safe multisig |
| BarterToken | `MINTER_ROLE` | Backend / Engine |
| BarterToken | `BURNER_ROLE` | Backend / Engine |
| BarterToken | `FREEZER_ROLE` | Optional global freezer |
| TradeSettlement | `SETTLER_ROLE` | Backend / Engine |

## Fee rules

- Same exchange: `inNetworkFeeBps` (default 1000) → seller's operator
- Different exchanges: 1500 bps total → 1000 operator + `platformFeeBps` (default 500) treasury
- Fees are seller-side only

## Reverts (settlement)

- `ZeroAddress`, `ZeroAmount`
- `TradeRefUsed`
- `UnregisteredMember`
- `ExchangeInactive`
- ERC-20 insufficient balance / allowance
- Token: `AccountFrozen`, `ExchangeSuspended`

## Credit-line flow (off-chain)

1. Check balance; if short, mint shortfall within credit limit
2. Write pending trade with `trade_ref`
3. `settleTrade`
4. On earn, burn up to outstanding debt
