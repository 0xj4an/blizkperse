# Blizkperse - Technical Specification

> **Core Concept**: ZK-private payout distribution platform on Monad. Organizers deposit tokens into an escrow, subscribers claim them with zero-knowledge proofs so payment amounts stay hidden on-chain.
> **Use Case**: Starting with hackathon grants, scaling to payroll, bounties, and social payments.

---

## 1. Technology Stack

- **Blockchain**: Monad Mainnet (Chain ID 143).
- **Token Strategy**: Architecture supports any ERC-20. MVP defaults to USDm.
- **Frontend**: Next.js 16 (App Router, Turbopack), Tailwind CSS v4, Framer Motion.
- **UI Components**: shadcn/ui (new-york style, Radix primitives).
- **Auth & Wallets**: Para SDK (`@getpara/react-sdk`) for social login + embedded wallets.
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`.
- **Smart Contracts**: Foundry (Solidity).
- **ZK Circuits**: Noir (Aztec).
- **Design Philosophy**: Agent-ready. The system should be composable so AI agents can trigger payouts programmatically.

---

## 2. Architecture Overview

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
3. Subscription is stored in Supabase with status `active`.

#### D. Payout (Deposit & Commit)
1. Organizer selects subscribers and sets amounts (manual or equal split).
2. Frontend fetches `zk_public_key` for each recipient.
3. Frontend computes commitments: `Hash(amount, public_key, randomness)`.
4. Organizer calls `Escrow.deposit(commitments[])`.
   - Contract pulls tokens.
   - Contract inserts commitments into Merkle Tree.
5. Payout and individual payment records are stored in Supabase.

#### E. Claim (Prove & Withdraw)
1. Subscriber sees "Claimable" payment in their dashboard.
2. Frontend downloads Merkle path and generates a ZK proof.
3. Subscriber calls `Escrow.withdraw(proof, nullifier, amount)`.
   - Contract verifies proof.
   - Contract checks nullifier (double-spend protection).
   - Contract transfers tokens to `msg.sender`.
4. Payment status updated to `claimed` in Supabase.

---

## 3. Database Schema (Supabase)

Schema file: [`supabase/schema.sql`](../supabase/schema.sql)

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

## 4. Smart Contracts (Deployed on Monad Mainnet)

### Deployed Addresses
- **HonkVerifier**: `0x1d42C0cD5fF14Ee71456473828996b1bC251a735`
- **Pool (Escrow)**: `0x35C8F36a031389f469372C370dA3Cb46Dd69265a`

### `BlizkperseEscrow.sol`
Manages the Merkle Tree and ZK proof verification.

```solidity
contract BlizkperseEscrow {
    IVerifier public verifier;
    IERC20 public usdm;
    mapping(uint256 => bool) public nullifiers;
    MerkleTree public tree;

    function deposit(bytes32[] commitments, uint256 totalAmount) external {
        usdm.transferFrom(msg.sender, address(this), totalAmount);
        for (bytes32 c : commitments) {
            tree.insert(c);
        }
    }

    function withdraw(
        bytes proof,
        bytes32 root,
        bytes32 nullifier,
        uint256 amount
    ) external {
        require(!nullifiers[nullifier], "Double spend");
        require(verifier.verify(proof, root, nullifier, amount), "Invalid Proof");

        nullifiers[nullifier] = true;
        usdm.transfer(msg.sender, amount);
    }
}
```

---

## 5. Zero Knowledge Circuits (Noir)

Circuit source: [`blizkperse/`](../blizkperse/)

### `withdraw.nr` (The Claim Circuit)
- **Public Inputs**: `root`, `nullifier`, `amount`, `recipient` (bound to msg.sender).
- **Private Inputs**: `secret_key`, `path_indices`, `path_siblings`, `randomness`.
- **Logic**:
  1. Reconstruct `commitment = Hash(amount, public_key, randomness)`.
  2. Verify `commitment` exists in Merkle Tree at `root`.
  3. Verify `nullifier = Hash(secret_key, path_indices)` (deterministic).
  4. Output `root`, `nullifier`, `amount`.

---

## 6. Frontend Architecture

Source: [`web/`](../web/)

### File Structure
```
web/
  app/
    layout.tsx          # Root layout: dark theme, Inter font, Providers, Toaster
    globals.css         # Monad purple/black theme (oklch), glassmorphism utilities
    page.tsx            # Landing page (hero, problem, how it works, features)
    dashboard/page.tsx  # Role selection (Organize / Receive)
    payer/
      layout.tsx        # AuthGuard + PageShell wrapper
      page.tsx          # Organizer dashboard (org selector, stats, subscribers, payouts)
      create/page.tsx   # Multi-step payout creation (select > amounts > review > deposit)
    receive/
      layout.tsx        # AuthGuard + PageShell wrapper
      page.tsx          # Subscriber dashboard (browse orgs, subscriptions, payment history)
      [id]/page.tsx     # Claim page (view payment, transfer to wallet)
  components/
    providers.tsx       # ParaProvider + QueryClientProvider ("use client")
    header.tsx          # Nav bar with wallet connect/disconnect
    auth-guard.tsx      # Route protection via useAccount()
    page-shell.tsx      # Page layout wrapper
    tx-status.tsx       # Transaction status animation (idle > pending > success)
    wallet-display.tsx  # Truncated address + copy
    ui/                 # shadcn/ui components
  lib/
    utils.ts            # cn() helper
    constants.ts        # App-wide constants
    supabase.ts         # Supabase client
    database.types.ts   # TypeScript types for Supabase tables
    store.ts            # Reactive store (useSyncExternalStore + Supabase)
    mock-data.ts        # Legacy mock data (unused)
    mock-actions.ts     # Legacy mock actions (unused)
```

### Reactive Store Pattern
The app uses `useSyncExternalStore` to maintain a local cache that syncs with Supabase:
- **Hydration**: On first render, all tables are fetched from Supabase into memory.
- **Mutations**: Each action (create org, join, create payout, claim) writes to Supabase first, then updates the local cache and triggers re-renders.
- **Hook**: `useStore()` provides reactive access to the full state.

### Design System
- **Theme**: Monad purple/black with oklch color space.
- **Primary**: `oklch(0.65 0.25 285)` (vibrant purple).
- **Background**: `oklch(0.09 0.015 280)` (near-black with purple tint).
- **Custom utilities**: `.glass` (glassmorphism), `.glow-purple` (hover glow), `.gradient-text`.
- **Dark mode**: Always-on via `className="dark"` on `<html>`.

---

## 7. Environment Variables

```env
NEXT_PUBLIC_PARA_API_KEY=        # Para SDK API key
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anonymous/public key
```

---

## 8. Monad Network Details

- **RPC**: `https://rpc3.monad.xyz`
- **Chain ID**: `143`
- **Currency**: `MON`
- **Explorer**: `https://testnet.monadexplorer.com`
- **Speed**: Sub-second finality. UI should feel instant.

### Token Addresses
- **Native Gas Token**: `MON` (for gas fees).
- **USDC**: `0x534b2f3A21130d7a60830c2Df862319e593943A3` or `0x77F77926C6596c78f285D230Cd0dC8dC3540e3a6`.

---

## 9. Deployment

### Frontend (Railway)
- Connect GitHub repo for automated deployments.
- Set `output: "standalone"` in `next.config.ts`.
- Add environment variables in Railway dashboard.
- `NEXT_PUBLIC_*` env vars are inlined at build time.

### Database (Supabase)
1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor to create all tables.
3. Copy the project URL and anon key to environment variables.
4. RLS policies are pre-configured (public for demo, restrict in production).
