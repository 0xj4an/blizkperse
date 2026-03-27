# Blizkperse - Technical Specification

> **Core Concept**: Chain-agnostic ZK-private payout distribution platform. Organizers deposit tokens into a shielded pool, subscribers claim them with zero-knowledge proofs so payment amounts stay hidden on-chain.
> **Use Case**: Payroll privacy, grants, bounties, DAO treasury distributions, and x402 agent payments.

---

## 1. Technology Stack

The project is split into two independent frontends and a shared ZK/contract layer:

- **Blockchain**: Multi-chain EVM. Live on Monad (Chain 143) and Celo (42220).
- **Token Strategy**: Architecture supports any ERC-20 stablecoin. Defaults to USDC.
- **Frontend**: Next.js 16 (App Router, Webpack), Tailwind CSS v4, Framer Motion.
- **UI Components**: shadcn/ui (new-york style, Radix primitives).
- **Auth & Wallets**: Para SDK (`@getpara/react-sdk`) for social login + embedded wallets.
- **Database**: PostgreSQL via `postgres` npm package (hosted on Railway).
- **Smart Contracts**: Foundry (Solidity).
- **ZK Circuits**: Noir (Aztec).
- **Design Philosophy**: Chain-agnostic, agent-ready. The system is composable so AI agents can trigger payouts programmatically via x402.

---

## 2. Landing Page

Source: [`landing/`](../landing/)

A static marketing site at `blizkperse.com`. Built with Next.js 16 and Framer Motion. No auth, no database, no ZK dependencies. Uses only the neutral grayscale palette (no chain-adaptive switching).

**Sections**: Header (sticky nav) → Hero (ASCII art logo + tagline) → Stats strip (2 chains, 100% on-chain, 0 KYC, OSS) → Explorer comparison (public vs shielded) → Problem statement → How it works (3 steps) → Features (ZK privacy, non-custodial, multi-chain, zero friction) → Use cases (payroll, grants, agent payments) → Built on (Noir, Monad, Celo) → Partners → CTA → Footer.

**Key dependencies**: `next@16`, `react@19`, `framer-motion`, `lucide-react`, `tailwindcss@4`.

### File Structure

```text
landing/
  app/
    fonts/                  # Geist Sans + Mono (woff2)
    favicon.ico
    globals.css             # Neutral-only theme (no chain switching)
    layout.tsx              # Root layout: dark theme, Geist font, SEO metadata
    page.tsx                # Landing page (all sections above)
  components/
    ui/
      button.tsx            # Minimal shadcn/ui button
  lib/
    utils.ts                # cn() helper
  public/
    partners/               # Partner logos (CeloCol, TuCOP)
    logo.png
    logo.svg
  .env.local                # NEXT_PUBLIC_APP_URL
  next.config.ts
  package.json
  postcss.config.mjs
  tsconfig.json
```

### Environment Variables

```env
NEXT_PUBLIC_APP_URL=https://app.blizkperse.com  # URL for "Launch App" buttons
```

### Deployment (Railway)

- Separate Railway service pointing to `Dockerfile.landing`.
- Set `NEXT_PUBLIC_APP_URL=https://app.blizkperse.com`.
- Watch path: `/landing/**` to avoid rebuilds on app changes.

---

## 3. App Architecture

Source: [`web/`](../web/)

The app at `app.blizkperse.com` is a full-stack Next.js 16 application with Para SDK authentication, PostgreSQL storage, and ZK proof generation.

### Multi-Chain Support

The app uses a `ChainProvider` React context that holds the active chain. All contract functions, wallet hooks, and theme colors derive from the selected chain.

```text
ChainProvider (localStorage-persisted)
  +-- data-chain attr on <html> -> CSS variable swap (per-chain theming)
  +-- useChain() -> { chainId, chain: ChainConfig, setChainId }
  +-- contracts.ts functions take ChainConfig param
  +-- wallet.ts reads chain from useChain()
  +-- header.tsx shows ChainSelector dropdown
```

**Supported chains** are defined in `web/lib/constants.ts` as a `CHAINS` registry keyed by chain ID. Adding a new chain requires only adding an entry to this registry and a CSS theme block.

### Actors

1. **Organizer**: Creates an organization, manages subscribers, deposits tokens and creates private commitments for recipients.
2. **Subscriber**: Joins an organization, generates a ZK proof to claim their payment and withdraw tokens privately.

### User Flows

#### A. Onboarding

1. User logs in via Para SDK (social login or email).
2. Para creates an embedded wallet automatically.
3. User chooses role: **Organize** (distribute payouts) or **Receive** (claim payments).

#### B. Organization Setup (Organizer)

1. Organizer creates an organization (name + wallet address).
2. Organization appears in the browse list for subscribers.
3. Organizer can manage multiple organizations from one wallet.

#### C. Subscription (Subscriber)

1. Subscriber browses available organizations.
2. Clicks "Join" to subscribe.
3. Subscription is stored in the database with status `active`.

#### D. Payout (Deposit & Commit)

1. Organizer selects subscribers and sets amounts (manual or equal split).
2. Organizer selects token from the active chain's token list.
3. Frontend computes commitments: `Poseidon2(Poseidon2(value, holder_pk), Poseidon2(random, nullifier))`.
4. Organizer calls `ShieldedPool.deposit(commitment)` on the active chain.
   - Contract pulls tokens.
   - Contract inserts commitments into Merkle Tree.
5. Payout and individual payment records are stored in the database.

#### E. Claim (Prove & Withdraw)

1. Subscriber sees "Claimable" payment in their dashboard.
2. Frontend builds Merkle tree from on-chain Deposit events.
3. Frontend generates a ZK proof using the Noir circuit.
4. Subscriber calls `ShieldedPool.withdraw(proof, publicInputs)`.
   - Contract verifies proof via WithdrawHonkVerifier.
   - Contract checks nullifier (double-spend protection).
   - Contract transfers tokens to recipient.
5. Payment status updated to `claimed` in the database.

### App File Structure

> See the [root README](../README.md#project-structure) for the full repo layout.

```text
web/
  app/
    api/
      data/                 # GET: fetch all store data (hydration endpoint)
      deposit-events/       # GET: fetch deposit events by chain
      generate-proof/       # POST: server-side proof generation via nargo + bb
      notes/                # POST: store generated ZK notes
      organizers/           # POST/GET: create/fetch organizers
      payments/[id]/claim   # PATCH: mark payment as claimed
      payouts/              # POST/GET: create/fetch payouts
      subscribers/          # POST/GET: create/fetch subscribers
      subscriptions/        # POST: subscribe to organizer
    dashboard/page.tsx      # Role selector (payer vs receiver)
    lib/
      withdrawProver.ts     # Server-side withdrawal proof helper (nargo + bb CLI)
    payer/
      create/page.tsx       # Multi-step payout creation (select > amounts > review > deposit)
      layout.tsx            # AuthGuard + PageShell wrapper
      page.tsx              # Organizer dashboard (orgs, stats, subscribers, payouts)
    receive/
      [id]/page.tsx         # Claim page (ZK proof generation + withdrawal)
      layout.tsx            # AuthGuard + PageShell wrapper
      page.tsx              # Subscriber dashboard (browse orgs, subscriptions, payments)
    client-shell.tsx        # Providers + ChainProvider wrapper
    globals.css             # Chain-adaptive themes (neutral, Monad purple, Celo yellow)
    layout.tsx              # Root layout: dark theme, Geist font
    page.tsx                # Chain selector (network selection entry page)
  components/
    ui/                     # shadcn/ui components
    auth-guard.tsx          # Route protection via useAccount()
    chain-selector.tsx      # Chain switching dropdown
    header.tsx              # Nav bar with inline SVG logo, ChainSelector, wallet
    page-shell.tsx          # Page layout wrapper
    para-wrapper.tsx        # Para SDK modal wrapper + wallet config
    providers.tsx           # ParaProvider + QueryClientProvider ("use client")
    tx-status.tsx           # Transaction status animation (idle > pending > success)
    wallet-display.tsx      # Wallet address display with copy
  lib/
    api-auth.ts             # API route auth middleware
    auth-shared.ts          # Shared auth logic
    chain-context.tsx       # ChainProvider React context + useChain() hook
    constants.ts            # ChainConfig registry, token configs, chain IDs
    contracts.ts            # Viem-based contract interactions (chain-parameterized)
    database.types.ts       # TypeScript types for DB tables
    db.ts                   # PostgreSQL client + auto-schema via ensureSchema()
    merkle.ts               # Client-side Merkle tree from on-chain events
    server-auth.ts          # Server-side auth helpers
    store.ts                # Reactive store (useSyncExternalStore + PostgreSQL)
    utils.ts                # cn() helper
    wallet.ts               # Para wallet client hook (chain-aware)
    zk.ts                   # Noir proof generation + crypto primitives (Poseidon2)
  public/
    circuits/circuit.json   # Compiled Noir circuit artifact
```

### Reactive Store Pattern

The app uses `useSyncExternalStore` to maintain a local cache that syncs with PostgreSQL:

- **Hydration**: On first render, all tables are fetched from the database into memory.
- **Mutations**: Each action (create org, join, create payout, claim) writes to the database first, then updates the local cache and triggers re-renders.
- **Hook**: `useStore()` provides reactive access to the full state.

### Design System

- **Theming**: Chain-adaptive with neutral grayscale default. No colors until user selects a chain.
- **Monad theme**: Purple palette (`oklch(0.65 0.25 285)`) activated via `html[data-chain="monad"]`.
- **Celo theme**: Yellow/deep-purple palette (Celo brand `#fcff52` + `#1e002b`) via `html[data-chain="celo"]`.
- **Neutral default**: Pure grayscale, zero chroma.
- **Custom utilities**: `.glass` (glassmorphism), `.glow-primary` (hover glow), `.gradient-text`.
- **Dark mode**: Always-on via `className="dark"` on `<html>`.
- **Logo**: Inline SVG with shield stroke using `currentColor` that adapts to active chain.
- **Transitions**: `transition-colors duration-500` for smooth theme switching.

### App Environment Variables

See `web/.env.example` for the full list with descriptions.

```env
# Required
NEXT_PUBLIC_PARA_API_KEY=            # Para SDK API key (prod: prod_*, beta: beta_*)
DATABASE_URL=                        # PostgreSQL connection string (Railway auto-injects)

# Environment switching
BLIZ_ENV=production                  # Server-side: production | development
NEXT_PUBLIC_BLIZ_ENV=production      # Client-side: production (mainnet) | development (testnet)
NEXT_PUBLIC_DEFAULT_CHAIN=celo       # Initial chain slug: celo | monad

# Optional overrides
NEXT_PUBLIC_PARA_API_KEY_BETA=       # Para SDK beta key (used when BLIZ_ENV=development)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID= # WalletConnect project ID
NEXT_PUBLIC_MONAD_RPC=               # Override Monad RPC URL
NEXT_PUBLIC_CELO_RPC=                # Override Celo RPC URL
```

### App Deployment (Railway)

- Connect GitHub repo for automated deployments.
- Set `output: "standalone"` in `next.config.ts`.
- Add environment variables in Railway dashboard.
- `NEXT_PUBLIC_*` env vars are inlined at build time.
- Build command must use `--webpack` flag (Turbopack incompatible with `@aztec/bb.js` WASM).

#### Database (PostgreSQL on Railway)

1. Add a PostgreSQL service in Railway (or use any PostgreSQL host).
2. Railway auto-injects `DATABASE_URL` into the app service.
3. The app auto-creates tables on first API call via `ensureSchema()` in `lib/db.ts`.
4. Alternatively, run `sql/schema.sql` manually to pre-create tables.

---

## 4. Database Schema (PostgreSQL)

Schema file: [`sql/schema.sql`](../sql/schema.sql)

### `organizers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Organization name |
| `owner_address` | text | Wallet address of the organizer |
| `total_distributed` | numeric | Running total of distributed tokens |
| `subscriber_count` | integer | Number of active subscribers |
| `created_at` | timestamptz | Auto-generated |

### `subscribers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `address` | text (unique) | Wallet address |
| `name` | text | Display name |
| `email` | text | Optional |
| `created_at` | timestamptz | Auto-generated |

### `subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `organizer_id` | uuid (FK) | References organizers |
| `subscriber_id` | uuid (FK) | References subscribers |
| `status` | text | `active` or `pending` |
| `created_at` | timestamptz | Auto-generated |

Unique constraint on `(organizer_id, subscriber_id)`.

### `payouts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `organizer_id` | uuid (FK) | References organizers |
| `total_amount` | numeric | Sum of all payments in this payout |
| `token` | text | Token symbol (default `'MON'`) |
| `status` | text | `pending`, `deposited`, `distributed`, `claimed` |
| `tx_hash` | text | On-chain transaction hash |
| `created_at` | timestamptz | Auto-generated |

### `payments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `payout_id` | uuid (FK) | References payouts |
| `organizer_id` | uuid (FK) | References organizers |
| `subscriber_id` | uuid (FK) | References subscribers |
| `amount` | numeric | Payment amount |
| `status` | text | `pending`, `claimable`, `claimed`, `expired` |
| `claimed_at` | timestamptz | When claimed |
| `tx_hash` | text | Claim transaction hash |
| `created_at` | timestamptz | Auto-generated |

### `notes`

Stores private ZK note data needed for proof generation. Created when an organizer deposits a payout; consumed when a subscriber generates a claim proof.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `payment_id` | uuid (FK, unique) | References payments (one note per payment) |
| `subscriber_id` | text | Subscriber wallet address |
| `chain_id` | integer | Chain where the deposit was made |
| `commitment` | text | Poseidon2 commitment hash |
| `value` | text | Note value (field element) |
| `holder_pk` | text | Holder public key (field element) |
| `randomness` | text | Random blinding factor (field element) |
| `nullifier` | text | Nullifier for double-spend protection |
| `leaf_index` | integer | Position in the on-chain Merkle tree |
| `created_at` | timestamptz | Auto-generated |

Indexed on `(subscriber_id, chain_id, created_at)` and `(chain_id, payment_id)` for efficient lookups.

### Row Level Security

RLS is enabled on all tables. For the demo, public read/write policies are applied. In production, policies should be scoped to the authenticated user's wallet address.

---

## 5. Smart Contracts

All contract addresses, deploy blocks, and token configs are maintained in [`web/lib/constants.ts`](../web/lib/constants.ts). See the root [README Supported Chains table](../README.md#supported-chains) for a quick reference.

### `ShieldedPool.sol`

Manages deposits, transfers, and withdrawals using ZK proof verification.

```solidity
contract ShieldedPool {
    uint256 public constant DENOMINATION = 1e6; // 1 USDC
    IERC20 public immutable usdc;
    IVerifier public immutable verifier;          // HonkVerifier (transfer circuit)
    IVerifier public immutable withdrawVerifier;  // WithdrawHonkVerifier (withdraw circuit)
    mapping(bytes32 => bool) public isKnownRoot;
    mapping(bytes32 => bool) public nullifiers;
    mapping(bytes32 => bool) public usedCommitments;

    // Register a computed Merkle root (permissionless)
    function registerRoot(bytes32 root) external;

    // Deposit 1 USDC and create a commitment
    function deposit(bytes32 commitment) external;

    // Transfer between commitments (verified by HonkVerifier)
    function transferIntent(
        bytes32 expectedRoot,
        bytes32 nullifierIn,
        uint32 merkleProofLength,
        bytes32 newCommitment,
        bytes calldata proof
    ) external;

    // Withdraw 1 USDC with ZK proof (verified by WithdrawHonkVerifier)
    // publicInputs: [value, nullifier, merkle_proof_length, expected_merkle_root, recipient]
    function withdraw(bytes calldata proof, bytes32[] calldata publicInputs) external;
}
```

**Events**: `RootRegistered`, `Deposit`, `TransferIntent`, `Withdraw`.

---

## 6. Zero Knowledge Circuits (Noir)

Circuit source: [`zk/`](../zk/)

### `main.nr` / `withdraw.nr` (The Claim Circuit)

- **Public Inputs** (5): `value`, `nullifier`, `merkle_proof_length`, `expected_merkle_root`, `recipient`.
- **Private Inputs**: `pk_b`, `random`, `merkle_proof_indices`, `merkle_proof_siblings`.
- **Constants**: `MAX_DEPTH = 10`.
- **Logic**:
  1. Verify nullifier: `nullifier == Poseidon2(random, pk_b)` (proves knowledge of secret).
  2. Reconstruct commitment: `entry = Poseidon2(Poseidon2(value, pk_b), Poseidon2(random, nullifier))`.
  3. Verify `entry` exists in Merkle tree at `expected_merkle_root` using the Merkle proof.
  4. Assert `recipient != 0` (prevents front-running).

### `pay.nr` (The Transfer Circuit)

- **Public Inputs** (4): `new_commitment`, `nullifier_in`, `merkle_proof_length`, `expected_merkle_root`.
- **Private Inputs**: `value`, `pk_b`, `random`, `from`, `merkle_proof_indices`, `merkle_proof_siblings`.
- **Logic**:
  1. Derive output nullifier: `nullifier_out = Poseidon2(random, pk_b)`.
  2. Verify input note exists in Merkle tree at `expected_merkle_root`.
  3. Assert `entry_out == new_commitment` (binds proof to the new on-chain insertion).

---

## 7. Network Details

All network details (RPC URLs, chain IDs, native currencies, explorers, token addresses) are defined in [`web/lib/constants.ts`](../web/lib/constants.ts). See the root [README Supported Chains table](../README.md#supported-chains) for a summary.

---

## Related Documentation

- [Root README](../README.md) - Project overview, supported chains, quick start
- [Integration Guide](integration_guide.md) - Frontend to ZK to Contract wiring
- [Brand Kit](brand_kit.md) - Color palette, typography, chain-adaptive theming
- [ZK README](../zk/README.md) - Circuits, contracts, verifier generation
