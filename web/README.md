# Blizkperse Web Frontend

Next.js 16 frontend for the Blizkperse private payments platform.

## Stack

- **Framework**: Next.js 16 (App Router, Webpack)
- **Styling**: Tailwind CSS v4, shadcn/ui (new-york style)
- **Auth**: Para SDK (`@getpara/react-sdk`) for social login + embedded wallets
- **ZK**: `@noir-lang/noir_js` + `@aztec/bb.js` for in-browser proof generation
- **Database**: PostgreSQL via `postgres` npm package

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_PARA_API_KEY, DATABASE_URL, and chain env vars
npm run dev -- --webpack
```

> **Important**: The `--webpack` flag is required. Turbopack is incompatible with `@aztec/bb.js` WASM (`worker_threads` error).

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_PARA_API_KEY` | Para SDK API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `BLIZ_ENV` | Server-side environment selector for DB/runtime checks: `production` or `development` |
| `NEXT_PUBLIC_BLIZ_ENV` | `production` for mainnet deploys, `development` for testnet deploys |
| `NEXT_PUBLIC_DEFAULT_CHAIN` | Initial chain slug: `celo` or `monad` |
| `NEXT_PUBLIC_MONAD_*` | Monad RPC, explorer, chain id, deployed contracts, token, deploy block |
| `NEXT_PUBLIC_CELO_*` | Celo RPC, explorer, chain id, deployed contracts, token, deploy block |

## Project Structure

> For the full repo structure (landing, zk, docs, sql) see the [root README](../README.md#project-structure).

```
app/
  api/                    # API routes
    data/                 # GET: fetch all store data
    deposit-events/       # GET: fetch deposit events by chain
    generate-proof/       # POST: server-side proof generation
    notes/                # POST: store generated ZK notes
    organizers/           # POST/GET: create/fetch organizers
    payments/             # PATCH: claim payment
    payouts/              # POST/GET: create/fetch payouts
    subscribers/          # POST/GET: create/fetch subscribers
    subscriptions/        # POST: subscribe to organizer
  dashboard/              # Role selector (payer vs receiver)
  lib/                    # Server-side helpers (withdrawProver.ts)
  payer/                  # Organizer dashboard + payout creation
    create/               # Multi-step payout creation flow
  receive/                # Subscriber dashboard + claim pages
    [id]/                 # Claim page (ZK proof generation + withdrawal)
  client-shell.tsx        # Client-side app shell (providers + ChainProvider)
  globals.css             # Chain-adaptive themes (neutral default, per-chain overrides)
  layout.tsx              # Root layout: dark theme, Geist font
  page.tsx                # Chain selector (network selection entry)
components/
  ui/                     # shadcn/ui components
  auth-guard.tsx          # Route protection
  chain-selector.tsx      # Chain switcher (Monad/Celo)
  header.tsx              # Nav bar with chain selector
  page-shell.tsx          # Page layout wrapper
  para-wrapper.tsx        # Para SDK modal wrapper
  providers.tsx           # ParaProvider + QueryClient
  tx-status.tsx           # Transaction status with explorer link
  wallet-display.tsx      # Wallet address display
lib/
  api-auth.ts             # API route auth middleware
  auth-shared.ts          # Shared auth logic
  chain-context.tsx       # ChainProvider + useChain() hook
  constants.ts            # Chain registry (source of truth for addresses)
  contracts.ts            # Viem contract interactions
  database.types.ts       # TypeScript types for DB tables
  db.ts                   # PostgreSQL client + auto-schema
  merkle.ts               # Client-side Merkle tree from on-chain events
  server-auth.ts          # Server-side auth helpers
  store.ts                # Reactive store (useSyncExternalStore + PostgreSQL)
  utils.ts                # Shared utilities (cn helper)
  wallet.ts               # Wallet utilities
  zk.ts                   # Noir proof generation + crypto primitives
```

## Architecture Overview

The frontend is chain-adaptive: it starts with a neutral grayscale theme and applies chain-specific colors (purple for Monad, yellow for Celo) when the user selects a chain. The `ChainProvider` context gates the entire app behind chain selection, then exposes the active `ChainConfig` to all components.

State management uses a reactive store pattern (`useSyncExternalStore`) backed by PostgreSQL. Mutations write to the database first, then update the local cache and trigger re-renders.

Authentication is handled by Para SDK, which provides social login and embedded wallets as a client-only provider.

## Key Libraries

| Package | Version | Purpose |
|---|---|---|
| `@noir-lang/noir_js` | `1.0.0-beta.19` | Noir circuit compilation and witness generation |
| `@aztec/bb.js` | `4.0.4` | Barretenberg WASM prover (UltraHonk) |
| `@getpara/react-sdk` | latest | Social login + embedded wallets |
| `viem` | latest | EVM contract interactions |
| `postgres` | latest | PostgreSQL client (no ORM) |

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `worker_threads` error on dev/build | Turbopack incompatible with `@aztec/bb.js` WASM | Use `--webpack` flag: `npm run dev -- --webpack` |
| Para hydration mismatch | Para SDK is client-only | Wrap Para components with `"use client"` directive |
| Framer Motion `ease` type error | TypeScript strict mode | Add `as const` to ease arrays |

## Deployment (Railway)

1. Connect GitHub repo for automated deployments
2. Add PostgreSQL service in Railway
3. Set environment variables for the target environment (`NEXT_PUBLIC_PARA_API_KEY`, `NEXT_PUBLIC_BLIZ_ENV`, `NEXT_PUBLIC_MONAD_*`, `NEXT_PUBLIC_CELO_*`)
4. Railway auto-injects `DATABASE_URL`

Build uses `output: "standalone"` in `next.config.ts`.

## Landing Page

The marketing landing page is a separate Next.js project in `landing/` at the repo root. It has its own `package.json`, no Para SDK, no ZK, and no database. See the [root README](../README.md#project-structure) for details.

## Related Documentation

- [Technical Spec](../docs/technical_spec.md) - Full architecture, contract interfaces, DB schema
- [Integration Guide](../docs/integration_guide.md) - Frontend to ZK to Contract wiring
- [Brand Kit](../docs/brand_kit.md) - Color palette, typography, theming rules
- [ZK README](../zk/README.md) - Circuits, contracts, deployment
