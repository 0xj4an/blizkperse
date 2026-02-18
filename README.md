# Blizkperse (Monad)

**Making distributing crypto payments painless.**

Blizkperse is a general-purpose payout platform on **Monad**. It solves the "onboarding gap" by allowing organizers to send funds to users who haven't set up a wallet yet.

## How it works

1.  **Recipients** login via **Social Login** (Para) -> Instantly get an Embedded Wallet.
2.  **Recipients** "Subscribe" to a Payer (Organizer/DAO).
3.  **Payers** select subscribers from a list, input amounts of **Any Token** (USDC, MON, Memes), and execute a **Bulk Payout**.
4.  **Privacy (ZK)**: Payments are processed via Zero-Knowledge proofs.
5.  **Agents**: API-ready for AI Agents (OpenClaw) to trigger payouts autonomously.

## Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend (Next.js)"]
        UI[App UI]
        Auth[Para SDK<br/>Social Login + Wallets]
        Store[Reactive Store]
    end

    subgraph Backend["Backend (Railway)"]
        API[API Routes]
        DB[(PostgreSQL)]
    end

    subgraph Blockchain["Monad Mainnet (Chain 143)"]
        Pool[ShieldedPool Contract]
        Verifier[HonkVerifier Contract]
        USDC[ERC-20 Token]
    end

    subgraph ZK["Zero-Knowledge Layer"]
        Circuit[Noir Circuit<br/>Poseidon + Merkle]
        Proof[Proof Generation]
    end

    UI --> Auth
    UI --> Store
    Store <--> API
    API <--> DB
    UI --> Pool
    Pool --> Verifier
    Pool <--> USDC
    Proof --> Pool
    Circuit --> Proof

    style Frontend fill:#1a1030,stroke:#a855f7,color:#e2e8f0
    style Backend fill:#1a1030,stroke:#a855f7,color:#e2e8f0
    style Blockchain fill:#1a1030,stroke:#a855f7,color:#e2e8f0
    style ZK fill:#1a1030,stroke:#a855f7,color:#e2e8f0
```

## User Flow

```mermaid
flowchart LR
    subgraph Onboarding
        A([User Visits App]) --> B[Social Login<br/>via Para]
        B --> C[Embedded Wallet<br/>Created]
        C --> D{Choose Role}
    end

    subgraph Organizer["Organizer Flow"]
        D -- Organize --> E[Create<br/>Organization]
        E --> F[View<br/>Subscribers]
        F --> G[Select Recipients<br/>& Set Amounts]
        G --> H[Deposit to<br/>ShieldedPool]
    end

    subgraph Subscriber["Subscriber Flow"]
        D -- Receive --> I[Browse<br/>Organizations]
        I --> J[Subscribe<br/>to Org]
        J --> K[View Claimable<br/>Payments]
        K --> L[Claim via<br/>ZK Proof]
    end

    H -.->|Funds Available| K

    style Onboarding fill:#1a1030,stroke:#a855f7,color:#e2e8f0
    style Organizer fill:#1a1030,stroke:#7c3aed,color:#e2e8f0
    style Subscriber fill:#1a1030,stroke:#7c3aed,color:#e2e8f0
```

## ZK Payment Flow

```mermaid
sequenceDiagram
    participant O as Organizer
    participant App as Frontend
    participant S as PostgreSQL
    participant P as ShieldedPool
    participant V as HonkVerifier
    participant R as Recipient

    Note over O,R: --- DEPOSIT PHASE ---
    O->>App: Select recipients & amounts
    App->>App: Compute commitments<br/>C = Poseidon(amount, pubKey, random)
    O->>P: approve(USDC) + deposit(commitment)
    P->>P: Pull USDC, store commitment
    P-->>App: Deposit event
    App->>S: Record payout (status: deposited)

    Note over O,R: --- CLAIM PHASE ---
    R->>App: Click "Claim"
    App->>App: Fetch Merkle path
    App->>App: Generate ZK proof (Noir circuit)
    R->>P: withdraw(proof, root, nullifier)
    P->>V: Verify ZK proof
    V-->>P: Valid
    P->>P: Check nullifier (no double-spend)
    P->>R: Transfer USDC
    App->>S: Update payment (status: claimed)
```

## Database Schema

```mermaid
erDiagram
    ORGANIZERS {
        uuid id PK
        text name
        text owner_address
        numeric total_distributed
        int subscriber_count
        timestamptz created_at
    }

    SUBSCRIBERS {
        uuid id PK
        text address UK
        text name
        text email
        timestamptz created_at
    }

    SUBSCRIPTIONS {
        uuid id PK
        uuid organizer_id FK
        uuid subscriber_id FK
        enum status "active | pending"
        timestamptz created_at
    }

    PAYOUTS {
        uuid id PK
        uuid organizer_id FK
        numeric total_amount
        enum status "pending | deposited | distributed | claimed"
        text tx_hash
        timestamptz created_at
    }

    PAYMENTS {
        uuid id PK
        uuid payout_id FK
        uuid organizer_id FK
        uuid subscriber_id FK
        numeric amount
        enum status "claimable | claimed | expired"
        timestamptz claimed_at
        text tx_hash
        timestamptz created_at
    }

    ORGANIZERS ||--o{ SUBSCRIPTIONS : "has"
    SUBSCRIBERS ||--o{ SUBSCRIPTIONS : "joins"
    ORGANIZERS ||--o{ PAYOUTS : "creates"
    PAYOUTS ||--o{ PAYMENTS : "contains"
    SUBSCRIBERS ||--o{ PAYMENTS : "receives"
```

## Deployed Contracts (Monad Mainnet — Chain 143)

| Contract | Address |
|---|---|
| **HonkVerifier** | `0xf7b2eC9EC33e34431F7f184458aE18Fa418271E3` |
| **WithdrawVerifier** | `0xA465f96F9a0541D7392c5A22bBA7bc5f23e88f7c` |
| **ShieldedPool** | `0x085BD9c0C568BE5093130E2359B00e46cb0800d1` |
| **USDC** | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |

- **RPC**: `https://rpc3.monad.xyz`
- **Explorer**: `https://explorer.monad.xyz`
- **Deployer**: `0xc696DDc31486D5d8b87254d3AA2985F6d0906b3a`
- **Block**: `0x35811d2` (56,234,450)
- **Deployment artifact**: [`zk/deployments/monad-mainnet/run-latest.json`](zk/deployments/monad-mainnet/run-latest.json)

## Tech Stack

-   **Network**: Monad Mainnet (Chain 143, EVM High Performance)
-   **Contracts**: Foundry (Solidity) + Noir ZK Circuits
-   **Frontend**: Next.js + TailwindCSS
-   **Auth**: Para (Social Login + Embedded Wallets)
-   **Infrastructure**: Railway (PostgreSQL + Next.js Hosting)
-   **Payments**: Any ERC20 (Defaults to USDC)

## Documentation

### Architecture & Integration
| Doc | Description |
|---|---|
| [Technical Spec](docs/technical_spec.md) | Full architecture, ZK flows, DB schema, deployment |
| [Integration Guide](docs/integration_guide.md) | Frontend ↔ ZK ↔ Contract wiring, proof generation |

### ZK Circuits & Contracts
| Doc | Description |
|---|---|
| [Circuits README](zk/README.md) | Noir + Foundry setup, verifier generation |
| [Deposit/Withdraw Demo](zk/docs/DEMO_DEPOSIT_WITHDRAW.md) | Step-by-step demo: compile, deploy, deposit, withdraw |
| [Deposit/Withdraw Testing](zk/docs/TEST_DEPOSIT_WITHDRAW.md) | On-chain validation and anonymity verification |

### Pitch & Brand
| Doc | Description |
|---|---|
| [Pitch Deck](docs/pitch_deck.md) | 3-minute pitch narrative, GTM strategy, vision |
| [Pitch Slides](docs/pitch_slides.md) | 5-slide structure with speaker notes |
| [Brand Kit](docs/brand_kit.md) | Color palette, typography, design rules |
| [Hackathon Submission](docs/hackathon_submission.md) | Submission form, team info, project description |

## Deploy to Railway

1.  **Create project** — [railway.app](https://railway.app) → New Project → Deploy from GitHub
2.  **Add PostgreSQL** — Click "New" → "Database" → "PostgreSQL"
3.  **Link the DB** — Railway auto-injects `DATABASE_URL` into your app service
4.  **Run schema** — Connect to the DB (Railway → Data tab → Query) and paste [sql/schema.sql](sql/schema.sql)
5.  **Set env vars** — Add `NEXT_PUBLIC_PARA_API_KEY` in the app service variables
6.  **Deploy** — Push to GitHub; Railway builds and deploys automatically

## Getting Started (Local)

### Prerequisites
-   Node.js 18+
-   Foundry (`forge`)
-   npm
-   PostgreSQL (local or Railway dev DB)

### Installation

1.  Clone repo
2.  `cd web && npm install`
3.  `cd zk && forge install`
4.  Copy `web/.env.example` → `web/.env.local` and fill in `DATABASE_URL`
5.  Run `psql $DATABASE_URL < sql/schema.sql` to set up tables
6.  `cd web && npm run dev`

*Built with high-throughput love on Monad.*