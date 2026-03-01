# Blizkperse - Technical Specification

> **Core Concept**: Chain-agnostic ZK-private payout distribution platform. Organizers deposit tokens into a shielded pool, subscribers claim them with zero-knowledge proofs so payment amounts stay hidden on-chain.
> **Use Case**: Payroll privacy, grants, bounties, DAO treasury distributions, and x402 agent payments.

---

## 1. Technology Stack

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

## 2. Architecture Overview

### Multi-Chain Support
The app uses a `ChainProvider` React context that holds the active chain. All contract functions, wallet hooks, and theme colors derive from the selected chain.

```
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
3. Frontend computes commitments: `Hash(amount, public_key, randomness)`.
4. Organizer calls `ShieldedPool.deposit(commitment)` on the active chain.
   - Contract pulls tokens.
   - Contract inserts commitments into Merkle Tree.
5. Payout and individual payment records are stored in the database.

#### E. Claim (Prove & Withdraw)
1. Subscriber sees "Claimable" payment in their dashboard.
2. Frontend builds Merkle tree from on-chain Deposit events.
3. Frontend generates a ZK proof using the Noir circuit.
4. Subscriber calls `ShieldedPool.withdraw(proof, nullifier)`.
   - Contract verifies proof via HonkVerifier.
   - Contract checks nullifier (double-spend protection).
   - Contract transfers tokens to recipient.
5. Payment status updated to `claimed` in the database.

---

## 3. Database Schema (PostgreSQL)

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
| `status` | text | `claimable`, `claimed`, `expired` |
| `claimed_at` | timestamptz | When claimed |
| `tx_hash` | text | Claim transaction hash |
| `created_at` | timestamptz | Auto-generated |

### Row Level Security
RLS is enabled on all tables. For the demo, public read/write policies are applied. In production, policies should be scoped to the authenticated user's wallet address.

---

## 4. Smart Contracts

### Monad Mainnet (Chain 143)
- **HonkVerifier**: `0x6b11b3eB54Bbda485D616150A4C85E8629e1A552`
- **WithdrawVerifier**: `0x4d900D53514140755fe842eb3e0d53b12BBcCD24`
- **ShieldedPool**: `0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c`
- **USDC**: `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`
- **Deploy Block**: 58,002,970

### Celo Mainnet (Chain 42220)
- **HonkVerifier**: `0x085BD9c0C568BE5093130E2359B00e46cb0800d1`
- **WithdrawVerifier**: `0xfe231dd394Df5863B02BfA9CFA50f4877961d5b7`
- **ShieldedPool**: `0xcE61001eb3Cd531784D2Cee9DDAbB17a3fc6B16A`
- **USDC**: `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`
- **Deploy Block**: 60,249,143

### `ShieldedPool.sol`
Manages the Merkle Tree and ZK proof verification.

```solidity
contract ShieldedPool {
    IVerifier public verifier;
    IERC20 public token;
    mapping(uint256 => bool) public nullifiers;
    MerkleTree public tree;

    function deposit(bytes32 commitment) external {
        token.transferFrom(msg.sender, address(this), DENOMINATION);
        tree.insert(commitment);
    }

    function withdraw(
        bytes proof,
        bytes32 root,
        bytes32 nullifier
    ) external {
        require(!nullifiers[nullifier], "Double spend");
        require(verifier.verify(proof, root, nullifier), "Invalid Proof");

        nullifiers[nullifier] = true;
        token.transfer(msg.sender, DENOMINATION);
    }
}
```

---

## 5. Zero Knowledge Circuits (Noir)

Circuit source: [`zk/`](../zk/)

### `withdraw.nr` (The Claim Circuit)
- **Public Inputs**: `root`, `nullifier`, `new_commitment`.
- **Private Inputs**: `value`, `pk_b`, `random`, `merkle_proof_siblings`, `merkle_proof_indices`.
- **Logic**:
  1. Reconstruct `commitment = Poseidon2(Poseidon2(value, pk_b), Poseidon2(random, nullifier))`.
  2. Verify `commitment` exists in Merkle Tree at `root`.
  3. Verify nullifier is deterministic from the private inputs.
  4. Output `root`, `nullifier`, `new_commitment`.

---

## 6. Frontend Architecture

Source: [`web/`](../web/)

### File Structure
```
web/
  app/
    layout.tsx          # Root layout: dark theme, Geist font
    client-shell.tsx    # Providers + ChainProvider wrapper
    globals.css         # Chain-adaptive themes (neutral default, per-chain overrides)
    page.tsx            # Landing page (hero, use cases, features, CTA)
    payer/
      layout.tsx        # AuthGuard + PageShell wrapper
      page.tsx          # Organizer dashboard (org selector, stats, subscribers, payouts)
      create/page.tsx   # Multi-step payout creation (select > amounts > review > deposit)
    receive/
      layout.tsx        # AuthGuard + PageShell wrapper
      page.tsx          # Subscriber dashboard (browse orgs, subscriptions, payment history)
      [id]/page.tsx     # Claim page (ZK proof generation + withdrawal)
  components/
    providers.tsx       # ParaProvider + QueryClientProvider ("use client")
    header.tsx          # Nav bar with inline SVG logo, ChainSelector, wallet
    chain-selector.tsx  # Chain switching dropdown
    auth-guard.tsx      # Route protection via useAccount()
    page-shell.tsx      # Page layout wrapper
    tx-status.tsx       # Transaction status animation (idle > pending > success)
    ui/                 # shadcn/ui components
  lib/
    utils.ts            # cn() helper
    constants.ts        # ChainConfig registry, token configs, chain IDs
    chain-context.tsx   # ChainProvider React context + useChain() hook
    contracts.ts        # Viem-based contract interactions (chain-parameterized)
    wallet.ts           # Para wallet client hook (chain-aware)
    merkle.ts           # Client-side Merkle tree from on-chain events
    zk.ts               # Noir proof generation helpers
    store.ts            # Reactive store (useSyncExternalStore + PostgreSQL)
    db.ts               # PostgreSQL client
    database.types.ts   # TypeScript types for DB tables
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
- **Custom utilities**: `.glass` (glassmorphism), `.glow-purple` (hover glow), `.gradient-text`.
- **Dark mode**: Always-on via `className="dark"` on `<html>`.
- **Logo**: Inline SVG with shield stroke using `currentColor` — adapts to active chain.
- **Transitions**: `transition-colors duration-500` for smooth theme switching.

---

## 7. Environment Variables

```env
NEXT_PUBLIC_PARA_API_KEY=        # Para SDK API key
DATABASE_URL=                    # PostgreSQL connection string (Railway auto-injects)
```

---

## 8. Network Details

### Monad (Chain 143)
- **RPC**: `https://rpc3.monad.xyz`
- **Chain ID**: `143`
- **Currency**: `MON`
- **Explorer**: `https://monadexplorer.com`
- **USDC**: `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals)

### Celo (Chain 42220)
- **RPC**: `https://forno.celo.org`
- **Chain ID**: `42220`
- **Currency**: `CELO`
- **Explorer**: `https://celoscan.io`
- **USDC**: `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6 decimals)

---

## 9. Deployment

### Frontend (Railway)
- Connect GitHub repo for automated deployments.
- Set `output: "standalone"` in `next.config.ts`.
- Add environment variables in Railway dashboard.
- `NEXT_PUBLIC_*` env vars are inlined at build time.
- Build command must use `--webpack` flag (Turbopack incompatible with `@aztec/bb.js` WASM).

### Database (PostgreSQL on Railway)
1. Add a PostgreSQL service in Railway (or use any PostgreSQL host).
2. Railway auto-injects `DATABASE_URL` into the app service.
3. The app auto-creates tables on first API call via `ensureSchema()` in `lib/db.ts`.
4. Alternatively, run `sql/schema.sql` manually to pre-create tables.
