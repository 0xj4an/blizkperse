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
# Fill in NEXT_PUBLIC_PARA_API_KEY and DATABASE_URL
npm run dev -- --webpack
```

> **Important**: The `--webpack` flag is required. Turbopack is incompatible with `@aztec/bb.js` WASM (`worker_threads` error).

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_PARA_API_KEY` | Para SDK API key |
| `DATABASE_URL` | PostgreSQL connection string |

## Project Structure

```
app/
  page.tsx              # Landing page
  payer/                # Organizer dashboard + payout creation
  receive/              # Subscriber dashboard + claim pages
  api/                  # API routes (generate-proof, etc.)
components/
  header.tsx            # Nav bar with chain selector
  providers.tsx         # ParaProvider + QueryClient
  auth-guard.tsx        # Route protection
  ui/                   # shadcn/ui components
lib/
  constants.ts          # Chain registry (source of truth for addresses)
  chain-context.tsx     # ChainProvider + useChain() hook
  contracts.ts          # Viem contract interactions
  merkle.ts             # Client-side Merkle tree from on-chain events
  zk.ts                 # Noir proof generation
  store.ts              # Reactive store (useSyncExternalStore + PostgreSQL)
  db.ts                 # PostgreSQL client
```

## Architecture Overview

The frontend is chain-adaptive: it starts with a neutral grayscale theme and applies chain-specific colors (purple for Monad, yellow for Celo) when the user selects a chain. The `ChainProvider` context gates the entire app behind chain selection, then exposes the active `ChainConfig` to all components.

State management uses a reactive store pattern (`useSyncExternalStore`) backed by PostgreSQL. Mutations write to the database first, then update the local cache and trigger re-renders.

Authentication is handled by Para SDK, which provides social login and embedded wallets as a client-only provider.

## Key Libraries

| Package | Version | Purpose |
|---|---|---|
| `@noir-lang/noir_js` | `1.0.0-beta.0` | Noir circuit compilation and witness generation |
| `@aztec/bb.js` | `0.63.1` | Barretenberg WASM prover (UltraHonk) |
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
3. Set environment variables (`NEXT_PUBLIC_PARA_API_KEY`)
4. Railway auto-injects `DATABASE_URL`

Build uses `output: "standalone"` in `next.config.ts`.

## Related Documentation

- [Technical Spec](../docs/technical_spec.md) - Full architecture, contract interfaces, DB schema
- [Integration Guide](../docs/integration_guide.md) - Frontend to ZK to Contract wiring
- [Brand Kit](../docs/brand_kit.md) - Color palette, typography, theming rules
- [ZK README](../zk/README.md) - Circuits, contracts, deployment
