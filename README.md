# Blizkperse (Monad)

**Making distributing crypto payments painless.**

Blizkperse is a general-purpose payout platform on **Monad**. It solves the "onboarding gap" by allowing organizers to send funds to users who haven't set up a wallet yet.

## How it works

1.  **Recipients** login via **Social Login** (Privy) -> Instantly get an Embedded Wallet.
2.  **Recipients** "Subscribe" to a Payer (Organizer/DAO).
3.  **Payers** select subscribers from a list, input amounts of **Any Token** (USDC, MON, Memes), and execute a **Bulk Payout**.
4.  **Privacy (ZK)**: Payments are processed via Zero-Knowledge proofs.
5.  **Agents**: API-ready for AI Agents (OpenClaw) to trigger payouts autonomously.

## Tech Stack

-   **Network**: Monad (EVM High Performance)
-   **Contracts**: Foundry (Solidity)
-   **Frontend**: Next.js + TailwindCSS
-   **Auth**: Privy (Social Login + Embedded Wallets)
-   **Infrastructure**: Railway (PostgreSQL + Next.js Hosting)
-   **Payments**: Any ERC20 (Defaults to USDC: `0x534b...`)

## Getting Started

### Prerequisites
-   Node.js 18+
-   Foundry (`forge`)
-   pnpm/npm

### Installation

1.  Clone repo
2.  `pnpm install`
3.  `forge up`

*Built with high-throughput love on Monad.*