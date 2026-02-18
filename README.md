# Blizkperse (Monad)

**Making distributing crypto payments painless.**

Blizkperse is a general-purpose payout platform on **Monad**. It solves the "onboarding gap" by allowing organizers to send funds to users who haven't set up a wallet yet.

## How it works

1.  **Recipients** login via **Social Login** (Privy) -> Instantly get an Embedded Wallet.
2.  **Recipients** "Subscribe" to a Payer (Organizer/DAO).
3.  **Payers** select subscribers from a list, input amounts of **Any Token** (USDC, MON, Memes), and execute a **Bulk Payout**.
4.  **Privacy (ZK)**: Payments are processed via Zero-Knowledge proofs.
5.  **Agents**: API-ready for AI Agents (OpenClaw) to trigger payouts autonomously.

## Deployed Contracts (Monad Mainnet — Chain 143)

| Contract | Address |
|---|---|
| **HonkVerifier** | `0x1d42C0cD5fF14Ee71456473828996b1bC251a735` |
| **Pool** | `0x35C8F36a031389f469372C370dA3Cb46Dd69265a` |

RPC: `https://rpc3.monad.xyz`

## Tech Stack

-   **Network**: Monad Mainnet (Chain 143, EVM High Performance)
-   **Contracts**: Foundry (Solidity) + Noir ZK Circuits
-   **Frontend**: Next.js + TailwindCSS
-   **Auth**: Para (Social Login + Embedded Wallets)
-   **Infrastructure**: Railway (PostgreSQL + Next.js Hosting)
-   **Payments**: Any ERC20 (Defaults to USDC)

## Documentation

| Doc | Description |
|---|---|
| [Technical Spec](docs/technical_spec.md) | Full architecture, ZK flows, DB schema, dev phases |
| [Pitch Deck](docs/pitch_deck.md) | 3-minute pitch structure, GTM strategy, vision |
| [Brand Kit](docs/brand_kit.md) | Color palette, typography, design rules |
| [Circuits README](blizkperse/README.md) | Noir + Foundry setup, verifier generation, testing |

## Getting Started

### Prerequisites
-   Node.js 18+
-   Foundry (`forge`)
-   pnpm/npm

### Installation

1.  Clone repo
2.  `cd web && pnpm install`
3.  `cd blizkperse && forge install`

*Built with high-throughput love on Monad.*