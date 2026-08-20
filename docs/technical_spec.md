# Blizkperse - Technical Specification

> **Core Concept**: Chain-agnostic ZK-private payout distribution. Organizers deposit arbitrary token amounts into per-token shielded pools via a `PoolRouter`; subscribers claim with zero-knowledge proofs so amounts stay hidden on-chain.
> **Use Case**: Payroll privacy, grants, bounties, DAO treasury distributions, and x402 agent payments.

---

## 1. Technology Stack

- **Blockchain**: Multi-chain EVM. Live on Monad (143), Celo (42220), Robinhood Chain (4663).
- **Token strategy**: One `ShieldedPool` per token; arbitrary amounts. Defaults vary by chain (USDC / USDT / USDG).
- **Frontend**: Next.js 16 (App Router, Webpack), Tailwind CSS v4, Framer Motion.
- **Auth & wallets**: Para SDK for social login + embedded wallets.
- **Optional gasless claim**: Alchemy Account Kit + Gas Manager.
- **Database**: PostgreSQL (`postgres` npm package) on Railway.
- **Smart contracts**: Foundry — `PoolRouter`, `ShieldedPool`, deposit/withdraw Honk verifiers.
- **ZK**: Noir — `deposit.nr` (binds amount↔commitment) and `withdraw.nr` (claim).

Canonical on-chain model: [`zk/docs/arbitrary-amounts-multitoken.md`](../zk/docs/arbitrary-amounts-multitoken.md).

---

## 2. Landing Page

Source: [`landing/`](../landing/)

Static marketing site at `blizkperse.com`. Neutral grayscale only (no chain switching). Deploy via `Dockerfile.landing` with `NEXT_PUBLIC_APP_URL`.

---

## 3. App Architecture

Source: [`web/`](../web/)

### Multi-chain

`ChainProvider` persists the active chain. Contract calls, theming (`html[data-chain]`), and token lists come from `web/lib/constants.ts`.

**Supported mainnets**: Monad, Celo, Robinhood Chain. Adding a chain = registry entry + CSS theme + deploy + env.

### On-chain roles

| Role | Config | Duty |
|------|--------|------|
| Owner | Deployer `PRIVATE_KEY` | Router admin |
| Treasury | `TREASURY_ADDRESS` | Protocol fee recipient (`feeBps`, default 30 = 0.3%) |
| Root registrar | `ROOT_REGISTRAR_*` | Only caller of `ShieldedPool.registerRoot`; web `POST /api/sync-pool-root` |

### Actors

1. **Organizer (payer)**: Creates orgs, invites subscribers, deposits notes through the router.
2. **Subscriber (receiver)**: Joins via invite, claims notes to a chosen destination address.

### User flows

#### Payout (deposit)

1. Organizer selects subscribers, token, and arbitrary amounts.
2. App creates notes and requests `/api/generate-deposit-proof` (`[value, commitment]`).
3. Approve router for **gross** amount (`notes + fee`); on Monad+WMON use `depositNative`.
4. `PoolRouter.deposit` / `depositNative` → pool credits note amount; treasury gets fee.
5. Note saved (`token_symbol`, `pool_address`, `deposit_tx`); backend syncs Merkle tip as registrar.
6. Payments become `claimable`; payout status → `deposited`.

#### Claim (withdraw)

1. Subscriber opens claim page; one-time coachmark explains destination address (`claim-destination-tip`, localStorage key `blizkperse-claim-destination-tip`).
2. Destination defaults to connected wallet; any valid address may be pasted.
3. App builds Merkle tree **for that pool**, waits until tip root is registered, generates withdraw proof.
4. Withdraw via router (Alchemy AA when configured → no gas for claim; user still needs gas later to move funds).
5. `PATCH /api/payments/[id]/claim` verifies nullifier on-chain and sets payment `claimed`.
6. When all payments of a payout are finished (claimed/failed/expired) and ≥1 claimed, payout → `claimed` (`payout-status-db.ts`). Payer UI also derives status via `effectivePayoutStatus` so badges stay correct.

### Payout / payment status

| Entity | Statuses | Notes |
|--------|----------|-------|
| **Payout** | `pending`, `deposited`, `distributed`, `claimed`, `failed` | Payer badge “Ready to claim” ≈ `deposited` with unclaimed payments; “Claimed” when complete |
| **Payment** | `pending`, `claimable`, `claimed`, `expired`, `failed` | Claim path updates payment first, then may promote payout |

`GET /api/data` runs `syncFullyClaimedPayouts()` so historical rows stuck on `deposited` backfill to `claimed`.

### Design system

- Neutral grayscale until a chain is selected.
- Themes: Monad (purple), Celo (yellow), Robinhood (see `globals.css` / brand kit).
- Dark mode always on.

### Environment

See `web/.env.example`. Important groups:

```env
NEXT_PUBLIC_PARA_API_KEY=
DATABASE_URL=
BLIZ_ENV=production
NEXT_PUBLIC_BLIZ_ENV=production
NEXT_PUBLIC_DEFAULT_CHAIN=celo          # celo | monad | robinhood

# Per chain: ROUTER, POOL_*, DEPOSIT/WITHDRAW/HONK verifiers, RPC, deploy block
NEXT_PUBLIC_CELO_ROUTER_ADDRESS=
NEXT_PUBLIC_CELO_POOL_USDT_ADDRESS=
# …

ROOT_REGISTRAR_PRIVATE_KEY=             # server-only
NEXT_PUBLIC_PROTOCOL_FEE_BPS=30         # build-time display / quotes

# Optional Alchemy AA (gasless claim)
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=
```

### Deployment (Railway)

- `NEXT_PUBLIC_*` inlined at **build** time.
- Build must use `--webpack` (`@aztec/bb.js`).
- Schema auto-created via `ensureSchema()`; or apply `sql/schema.sql`.

---

## 4. Database Schema (PostgreSQL)

Schema file: [`sql/schema.sql`](../sql/schema.sql)

Core tables: `organizers`, `subscribers`, `subscriptions`, `payouts`, `payments`, `notes`, plus deposit-event cache used for confirmation / Merkle rebuilds.

**`payouts.status`**: `pending` | `deposited` | `distributed` | `claimed` | `failed`.

**`payments.status`**: `pending` | `claimable` | `claimed` | `expired` | `failed`.

**`notes`**: commitment secrets, `chain_id`, `pool_address`, `token_symbol`, `deposit_tx`, nullifier, etc.

---

## 5. Smart Contracts

Addresses: [`web/lib/constants.ts`](../web/lib/constants.ts) and [root README](../README.md#supported-chains).

### `PoolRouter`

- Maps `token → ShieldedPool`.
- `deposit` / `depositNative` / `withdraw` (optional unwrap).
- Protocol fee on top of note amount → `treasury`.
- Owner can `setPool`, `setFeeConfig`, etc.

### `ShieldedPool`

- Arbitrary `amount` (no fixed 1-token denomination).
- Deposit requires deposit ZK proof (`value == amount`).
- `registerRoot` is **registrar-only** (not permissionless).
- Withdraw verified by WithdrawHonkVerifier; nullifier double-spend protection.

### Deploy scripts (`zk/script/`)

1. `DeployDepositVerifier`
2. `DeployMultiPool` (tokens + router + fee + registrar)
3. `AddPool` — attach one more pool to an existing router

---

## 6. Zero Knowledge Circuits (Noir)

### `deposit.nr`

- Public: `[value, commitment]`
- Proves commitment construction and nullifier binding so deposited amount cannot be inflated.

### `withdraw.nr` / claim circuit

- Public: `value`, `nullifier`, `merkle_proof_length`, `expected_merkle_root`, `recipient`
- Private: holder pk, randomness, Merkle path
- Recipient is the destination address chosen on the claim page

### `pay.nr`

Transfer-between-notes circuit (HonkVerifier) for shielded transfers.

---

## 7. Network Details

RPC, explorers, token addresses, and deploy blocks live in [`web/lib/constants.ts`](../web/lib/constants.ts).

---

## Related Documentation

- [Root README](../README.md)
- [Integration Guide](integration_guide.md)
- [Brand Kit](brand_kit.md)
- [Arbitrary amounts + multi-token](../zk/docs/arbitrary-amounts-multitoken.md)
- [ZK README](../zk/README.md)
