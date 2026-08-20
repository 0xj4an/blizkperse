# Blizkperse Integration Guide (Frontend ↔ ZK ↔ Contract)

How the **Next.js app** talks to **PoolRouter / ShieldedPool** and **Noir** circuits.

Canonical on-chain model: [`zk/docs/arbitrary-amounts-multitoken.md`](../zk/docs/arbitrary-amounts-multitoken.md).

---

## 1. Resources Checklist

* **Chain registry**: [`web/lib/constants.ts`](../web/lib/constants.ts) — routers, per-token pools, verifiers, tokens, deploy blocks.
* **Circuits**: deposit + withdraw artifacts under `web/public/circuits/` (built from `zk/circuits`).
* **ABIs**: `forge build` inside `zk/`.
* **Registrar**: server `ROOT_REGISTRAR_PRIVATE_KEY` for `POST /api/sync-pool-root`.

---

## 2. Multi-Chain Architecture

```typescript
import { useChain } from "@/lib/chain-context";

function MyComponent() {
  const { chain } = useChain();
  // chain.router, chain.contracts.*, getPoolConfig(chain, symbol), …
}
```

To add a chain:

1. Deploy deposit verifier → `DeployMultiPool` (or `AddPool` for an extra token).
2. Add entry + tokens/pools to `CHAINS` / env `NEXT_PUBLIC_*`.
3. Add `html[data-chain="slug"]` theme in `globals.css`.
4. Configure Alchemy Gas Manager policy if you want gasless claims.

---

## 3. Setup ZK in Frontend

Dependencies: `@noir-lang/noir_js@1.0.0-beta.19`, `@aztec/bb.js@4.0.4`.

Build with **`--webpack`** (Turbopack breaks bb.js WASM).

* Deposit proofs: `/api/generate-deposit-proof` (server) from `deposit.nr`.
* Withdraw proofs: browser or `/api/generate-proof` from `withdraw.nr` via `web/lib/zk.ts`.

---

## 4. Contract Interactions

Functions live in `web/lib/contracts.ts` and take `ChainConfig` (+ optional pool/token).

### A. Payout (deposit)

1. Create note: `createNote(amountRaw, holderPk, …)` → commitment / nullifier / randomness.
2. `POST /api/generate-deposit-proof` with public inputs `[value, commitment]`.
3. Approve **router** for gross (`amount + protocolFee`).
4. Call `router.deposit` (ERC-20) or `router.depositNative` (Monad WMON only — **not** on Celo).
5. Persist note via `POST /api/notes` (include `deposit_tx`, `pool_address`, `token_symbol`).
6. Backend syncs Merkle tip as root registrar.

```typescript
import { approveRouterToken, depositNote } from "@/lib/contracts";
// Prefer high-level helpers in store.ts (createPayout flow) over raw calls.
```

### B. Claim (withdraw)

1. Show destination field (default = connected wallet). Coachmark: `ClaimDestinationTip`.
2. Build Merkle tree **for the note’s pool** from on-chain deposits.
3. Wait until `isRootKnown(pool, root)` (registrar already registered tip — **do not** call `registerRoot` from the user wallet).
4. Generate withdraw proof with `recipient` = destination address field element.
5. `router.withdraw` via EOA or Alchemy smart account (`claimPayment` in `store.ts`).
6. `PATCH /api/payments/:id/claim` with `tx_hash` → verifies nullifier spent; may mark parent payout `claimed`.

```typescript
import { withdrawFromPool, withdrawFromPoolViaSmartAccount } from "@/lib/contracts";
```

---

## 5. Merkle Tree Management

```typescript
import { buildTreeFromEvents } from "@/lib/merkle";

// Scope events to the note's pool address / chain
const tree = await buildTreeFromEvents(chainConfig, { poolAddress });
```

Root registration is **backend-only** (`/api/sync-pool-root`). Claims poll until the tip is known.

---

## 6. Payout status (payer UI)

* Payments update to `claimed` on successful claim/reconcile.
* Server promotes payout → `claimed` when all child payments are done (`payout-status-db.ts`).
* Client derives display status with `effectivePayoutStatus` (`payout-status.ts`) — **never** import the DB module from client components (bundles `postgres` and breaks the Next build).

---

## 7. Deployment Pipeline

1. Compile deposit + withdraw verifiers (`compile_deposit_verifier.sh`, `compile_withdraw_verifier.sh`).
2. `DeployDepositVerifier` → `DeployMultiPool` (set `TOKEN_ADDRESSES`, `FEE_BPS`, `TREASURY_ADDRESS`, `ROOT_REGISTRAR_ADDRESS`; `WRAPPED_NATIVE` only where needed).
3. Optional: `AddPool.s.sol` for an extra token on an existing router.
4. Update `web/lib/constants.ts` / Railway `NEXT_PUBLIC_*` + registrar private key.
5. Deploy `web/` to Railway (`--webpack`).

---

## Related Documentation

* [Technical Spec](technical_spec.md)
* [Brand Kit](brand_kit.md)
* [Arbitrary amounts + multi-token](../zk/docs/arbitrary-amounts-multitoken.md)
* [ZK Build & Deploy](../zk/docs/build-and-deploy.md)
* [Root README](../README.md)
