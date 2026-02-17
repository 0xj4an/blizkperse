# Blizkperse (Monad)

**Making distributing stablecoin rewards painless.**

Blizkperse is a payout distribution system built on **Monad**. It solves the "onboarding gap" for event rewards and community grants by allowing organizers to send funds before recipients even have a wallet.

## How it works

1.  **Organizers** upload a payout list (e.g., emails/GitHub handles + amounts in USDm).
2.  **Organizers** deposit the total amount into an onchain **Escrow Contract** on Monad.
3.  **Recipients** receive a link, login via **Social Login** (Google/Twitter/etc. powered by Privy).
4.  An **Embedded Wallet** is created instantly for them.
5.  Recipients click **Claim** to receive their USDm, with zero friction.

## Tech Stack

-   **Network**: Monad (EVM High Performance)
-   **Contracts**: Foundry (Solidity)
-   **Frontend**: Next.js + TailwindCSS
-   **Auth**: Privy (Social Login + Embedded Wallets)
-   **Payments**: USDC (Monad Testnet: `0x534b2f3A21130d7a60830c2Df862319e593943A3`)

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