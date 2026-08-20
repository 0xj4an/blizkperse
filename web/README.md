# Blizkperse Web Frontend

Next.js 16 frontend for the Blizkperse private payments platform.

## Stack

- **Framework**: Next.js 16 (App Router, Webpack)
- **Styling**: Tailwind CSS v4, shadcn/ui (new-york style)
- **Auth**: Para SDK (`@getpara/react-sdk`) for social login + embedded wallets
- **ZK**: `@noir-lang/noir_js` + `@aztec/bb.js` for deposit/withdraw proofs
- **Contracts**: `PoolRouter` + per-token `ShieldedPool` (via `lib/contracts.ts`)
- **Gasless claim (optional)**: Alchemy Account Kit / Gas Manager
- **Database**: PostgreSQL via `postgres` npm package

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_PARA_API_KEY, DATABASE_URL, routers/pools,
# ROOT_REGISTRAR_PRIVATE_KEY, optional Alchemy vars
npm run dev -- --webpack
```

> **Important**: The `--webpack` flag is required. Turbopack is incompatible with `@aztec/bb.js` WASM (`worker_threads` error).

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`.env.example`](.env.example) for the full list. Groups:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_PARA_API_KEY` | Para SDK API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `BLIZ_ENV` / `NEXT_PUBLIC_BLIZ_ENV` | `production` (mainnet) or `development` (testnet defaults) |
| `NEXT_PUBLIC_DEFAULT_CHAIN` | `celo` \| `monad` \| `robinhood` |
| `NEXT_PUBLIC_{CHAIN}_ROUTER_ADDRESS` | PoolRouter |
| `NEXT_PUBLIC_{CHAIN}_POOL_{TOKEN}_ADDRESS` | Per-token ShieldedPool |
| `NEXT_PUBLIC_{CHAIN}_DEPOSIT_VERIFIER_ADDRESS` | Deposit Honk verifier |
| `NEXT_PUBLIC_PROTOCOL_FEE_BPS` | Fee display / quotes (default 30) |
| `ROOT_REGISTRAR_PRIVATE_KEY` | Server-only; `registerRoot` signer |
| `NEXT_PUBLIC_ALCHEMY_*` | Optional AA / gas sponsorship for claims |

Chain address defaults live in `lib/constants.ts`.

## Project Structure

> Full repo layout: [root README](../README.md#project-structure).

```
app/
  api/
    data/                 # Hydration + payout claimed backfill
    generate-deposit-proof/
    generate-proof/       # Withdraw proof
    notes/
    payments/[id]/claim
    payments/reconcile
    sync-pool-root/       # Registrar Merkle tip sync
    …
  payer/                  # Distribute dashboard + create payout
  receive/                # Receive dashboard + claim (destination tip)
  terms/
components/
  claim-destination-tip.tsx
  …
lib/
  constants.ts            # Chain registry (source of truth)
  contracts.ts
  payout-status.ts        # Client-safe status helpers (import from UI)
  payout-status-db.ts     # Server SQL only — never import from client
  store.ts
  zk.ts
```

## Architecture Overview

Chain-adaptive UI: neutral grayscale until a network is selected (Monad / Celo / Robinhood). `ChainProvider` exposes `ChainConfig` to contracts and theming.

Reactive store (`useSyncExternalStore`) syncs with PostgreSQL. Auth is Para (wallet-signed API auth by address).

**Claim UX:** destination address field + one-time coachmark; optional Alchemy AA for gasless claim.

**Payer status:** payout badge derives from payments (`effectivePayoutStatus`); server promotes payout → `claimed` when all payments are done.

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `worker_threads` / WASM on build | Turbopack + bb.js | Use `--webpack` |
| `Can't resolve 'net'` / `tls` in build | Client imported `lib/db` or `payout-status-db` | Import only `payout-status.ts` from client pages |
| SumcheckFailed on withdraw | Verifier ≠ circuit / prove flags | See [`zk/docs/build-and-deploy.md`](../zk/docs/build-and-deploy.md) |
| Deposit succeeded but no note | Wrong pool address in env | Pool must match receipt / router mapping |

## Deployment (Railway)

1. PostgreSQL + `DATABASE_URL`
2. Build-time `NEXT_PUBLIC_*` (Para, routers, pools, Alchemy, fee)
3. Runtime `ROOT_REGISTRAR_PRIVATE_KEY`
4. Watch path `/web/**`; Dockerfile runs `next build --webpack`

## Related Documentation

- [Technical Spec](../docs/technical_spec.md)
- [Integration Guide](../docs/integration_guide.md)
- [Arbitrary amounts + multi-token](../zk/docs/arbitrary-amounts-multitoken.md)
- [Brand Kit](../docs/brand_kit.md)
- [ZK README](../zk/README.md)
