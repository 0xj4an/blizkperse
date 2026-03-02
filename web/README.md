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

## Deployment (Railway)

1. Connect GitHub repo for automated deployments
2. Add PostgreSQL service in Railway
3. Set environment variables (`NEXT_PUBLIC_PARA_API_KEY`)
4. Railway auto-injects `DATABASE_URL`

Build uses `output: "standalone"` in `next.config.ts`.
