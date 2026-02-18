# Blizkperse - Technical Specification (Master Plan)

> **Document Goal**: Complete guide for a developer to build "Blizkperse" on Monad Testnet.
> **Core Concept**: General-purpose Payout & Claim platform where Participants register with Payers.
> **Use Case**: Starting with Hackathons/Grants, scaling to Payroll/Social Payments.

---

## 1. Technology Stack

-   **Blockchain**: Monad Mainnet (Chain 143).
-   **Token Strategy**: Architecture supports **Any ERC20**. (MVP defaults to USDC for ease).
-   **Frontend**: Next.js 14+ (App Router), TailwindCSS, Lucide Icons.
-   **Auth & Wallets**: **Para** (Social Login + Embedded Wallets).
    -   *Why*: Seamless onboarding for non-crypto users.
-   **Core Philosophy**: **Agent-Ready**. The system should be composable so AI Agents (like OpenClaw) can eventually trigger payouts programmatically.
-   **Smart Contracts**: Foundry (Solidity).

---

## 2. Architecture Overview (ZK Edition)

### Actors
1.  **Payer**: Deposits USDC and creates **Private Notes** (Commitments) for recipients.
2.  **Participant**: Generates a **ZK Proof** to claim their note and withdraw USDC anonymously/securely.

### User Flows

#### A. Registration (Key Exchange)
1.  **Participant** logs in (Social/Embedded Wallet).
2.  Frontend generates a **ZK Identity** (Secret/Public Key).
3.  **Save to DB**: Store `zk_public_key` linked to the user.

#### B. Payout (Deposit & Commit)
1.  **Payer** selects recipients and amounts.
2.  **Frontend** fetches `zk_public_key` for each recipient.
3.  **Frontend** computes **Commitments** (Hash(amount, pk, random)) for each.
4.  **Payer** calls `Escrow.deposit(commitments[])`.
    -   Contract pulls USDC.
    -   Contract inserts commitments into **Merkle Tree**.

#### C. Claim (Prove & Withdraw)
1.  **Participant** sees "Pending Payment".
2.  **Frontend**:
    -   Downloads Merkle Path from Contract/Indexer.
    -   Generates **ZK Proof** (Circuit: "I own a note in the tree with Value X and Nullifier Y").
3.  **Participant** calls `Escrow.withdraw(proof, nullifier, amount)`.
    -   Contract verifies proof.
    -   Contract checks nullifier (double-spend protection).
    -   Contract transfers USDC to `msg.sender`.

---

## 3. Database Schema (Supabase)

### `users`
-   `address` (PK, string)
-   `zk_public_key` (string): For receiving private notes.
-   `name` / `email`

### `registrations` (Same as before)

### `payouts`
-   Tracks on-chain `Deposit` events to help users find their commitments.

---

## 4. Smart Contract (ZK Escrow)

### `BlizkperseEscrow.sol`
Manages the Merkle Tree and Verification.

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

### `withdraw.nr` (The "Pay" Circuit)
-   **Public Inputs**: `root`, `nullifier`, `amount`, `recipient` (optional, to bind to msg.sender).
-   **Private Inputs**: `secret_key`, `path_indices`, `path_siblings`, `randomness`.
-   **Logic**:
    1.  Reconstruct `commitment = Hash(amount, public_key, randomness)`.
    2.  Verify `commitment` exists in Merkle Tree at `root`.
    3.  Verify `nullifier = Hash(secret_key, path_indices)` (Deterministic).
    4.  Output `root`, `nullifier`, `amount`.

---

## 5. Development Steps (For the Dev)

### Phase 1: Setup
1.  **Repo**: `git init`.
2.  **Monad Testnet**: Configure `foundry.toml` with RPC.
3.  **Railway**:
    -   Create new Project -> Provision PostgreSQL.
    -   Get `DATABASE_URL`.
    -   **Add Environment Variables**:
        -   `NEXT_PUBLIC_PARA_API_KEY`: Get from Para Developer Portal.
        -   `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`: (If needed).
        -   *(Note: Para Environment is currently hardcoded to `BETA` in `providers.tsx`)*.
    -   Connect GitHub Repo for automated Next.js deployments.

### Phase 2: Contracts
1.  `forge init`.
2.  Implement `BlizkperseEscrow.sol` + `MockUSDC.sol`.
3.  Deploy to Monad Mainnet.

### Deployed Contracts (Monad Mainnet)
- **HonkVerifier**: `0x1d42C0cD5fF14Ee71456473828996b1bC251a735`
- **Pool**: `0x35C8F36a031389f469372C370dA3Cb46Dd69265a`

### Phase 3: Frontend & Auth
1.  `npx create-next-app`.
2.  Install `@privy-io/react-auth` (or Para equivalent).
3.  Wrap app in AuthProvider.
4.  Create Login Screen.

### Phase 4: Integration - Registration
1.  Create `web/app/receive/page.tsx` (Participant Dashboard).
2.  Fetch Payers from Railway DB (`users` table) via Prisma/Drizzle.
3.  "Join" button -> Insert into `registrations` table.

### Phase 5: Integration - Payouts
1.  Create `web/app/payer/create/page.tsx`.
2.  Fetch `registrations` where `payer == me`.
3.  **UI**: List with Checkboxes & Amount Inputs.
4.  **Logic**: `merkletreejs` to generate Root.
5.  **Tx**: `wagmi` `writeContract` -> `createPayout`.
6.  **Storage**: Store metadata in Railway DB `payouts`.

### Phase 6: Integration - Claiming
1.  Participant sees Payout in Dashboard (Join `payouts` table).
2.  Frontend recalculates/fetches Proof for the logged-in user.
3.  User clicks "Claim" -> `writeContract` -> `claim`.

---

## 6. Monad Specifics
-   **RPC**: `https://rpc3.monad.xyz`
-   **Chain ID**: `143`
-   **Currency**: `MON`.
-   **Explorer**: `https://testnet.monadexplorer.com`
-   **Speed**: Expect sub-second finality. UI should feel "instant".

### Token Addresses (Testnet - To Verify)
-   **Native Gas Token**: `MON` (Used for Gas Fees).
-   **USDC** (Payment Token): `0x534b2f3A21130d7a60830c2Df862319e593943A3` OR `0x77F77926C6596c78f285D230Cd0dC8dC3540e3a6`.

