# Arbitrary amounts + multi-token pools

## Model

- **One `ShieldedPool` per token per chain** (liquidity and Merkle trees are isolated).
- **`PoolRouter`** is the single front-end entrypoint: it routes `deposit` / `withdraw` to the correct pool.
- **Monad native (MON):** deposit via `router.depositNative` (wraps to WMON in the same tx). Withdraw can unwrap.
- **Celo native (CELO):** no wrapper. Celo [token duality](https://docs.celo.org/home/protocol/celo-token) means CELO is both gas and ERC-20 at `0x471EcE…a438`. Use a normal ERC-20 pool + `router.deposit` / `approve` — do **not** set `WRAPPED_NATIVE` to the CELO token or call `depositNative` on Celo.
- **Protocol fee:** `PoolRouter` charges `feeBps` (default **30 = 0.3%**) **on top** of the note amount. Payer sends `amount + fee`; pool credit / ZK note = `amount`; treasury receives `fee`. Set `FEE_BPS` + `TREASURY_ADDRESS` at deploy (or `setFeeConfig`).
- **Root registration:** `ShieldedPool.registerRoot` is **registrar-only** (`setRootRegistrar`). Backend `POST /api/sync-pool-root` rebuilds the tip from on-chain `Deposit` events (ordered by block) and registers it with `ROOT_REGISTRAR_PRIVATE_KEY`. Serialized per pool to avoid races under high deposit flow. Claims wait for the root; they no longer call `registerRoot` from the user wallet.
- **`value` in circuits** = raw token units (e.g. `1_500_000` for 1.5 USDC with 6 decimals).

## Deposit safety

Deposits require a ZK proof from the **deposit circuit** (`zk/circuits/src/deposit.nr`):

- Public inputs: `[value, commitment]`
- Proves `commitment = compute_entry(value, pk_b, random, nullifier)` and `nullifier = poseidon2([random, pk_b])`
- The pool checks `value == amount` before accepting tokens

Without this binding, a user could deposit a small amount with a commitment that encodes a large `value` and drain the pool on withdraw.

## Contracts

| Contract | Role |
|----------|------|
| `ShieldedPool` | Single ERC-20; arbitrary `amount`; deposit + withdraw verifiers |
| `PoolRouter` | `token → pool` registry; ERC-20 + native deposit; unwrap withdraw |
| `DepositHonkVerifier` | Generated via `circuits/scripts/compile_deposit_verifier.sh` |
| `WithdrawHonkVerifier` | Existing withdraw verifier |

## Compile deposit verifier

```bash
cd zk/circuits
noirup -v 1.0.0-beta.19   # align with @noir-lang/noir_js
# Prefer bb.js (same major as web/@aztec/bb.js). System `bb` CLI often mismatches → "Length is too large".
bash ./scripts/compile_deposit_verifier.sh
```

This overwrites `zk/contract/DepositVerifier.sol` with `DepositHonkVerifier`.

**Note:** `DepositVerifier.sol` and `WithdrawVerifier.sol` cannot be imported in the same Solidity file (duplicate `Fr` / `Honk` types). Deploy them in separate scripts.

Commitments / nullifiers in the web app use `poseidon-lite`, which matches the Noir `poseidon::bn254::hash_2` in these circuits (do not swap to a different Poseidon implementation without re-checking witness execute).

## Deploy

```bash
cd zk
source .env
# 1) Deposit verifier alone
forge script script/DeployDepositVerifier.s.sol:DeployDepositVerifier --rpc-url "$RPC_URL" --broadcast
export DEPOSIT_VERIFIER_ADDRESS=0x...   # from script log

# 2) Pools + router
# Comma-separated ERC-20s (WMON on Monad; CELO GoldToken on Celo)
export TOKEN_ADDRESSES=0xUSDC,0xUSDT,0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
export WRAPPED_NATIVE=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A  # Monad only; leave unset on Celo
export FEE_BPS=30
export TREASURY_ADDRESS=0xYourTreasury
export ROOT_REGISTRAR_ADDRESS=0xYourRegistrarWallet
forge script script/Deploy.s.sol:DeployMultiPool --rpc-url "$RPC_URL" --broadcast
```

### Add a pool to an existing router

```bash
export POOL_ROUTER_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
export DEPOSIT_VERIFIER_ADDRESS=0x...
export HONK_VERIFIER_ADDRESS=0x...       # transfer verifier
export WITHDRAW_VERIFIER_ADDRESS=0x...
export ROOT_REGISTRAR_ADDRESS=0x...      # optional
forge script script/AddPool.s.sol:AddPool --rpc-url "$RPC_URL" --broadcast
```

Then set the matching `NEXT_PUBLIC_*_POOL_<TOKEN>_ADDRESS` in web / Railway.

Web env for the registrar service:

```bash
ROOT_REGISTRAR_PRIVATE_KEY=0x...   # same wallet as ROOT_REGISTRAR_ADDRESS
ROOT_REGISTRAR_API_SECRET=...      # optional; for cron Authorization: Bearer …
```

Then set in the web env (per chain):

- `NEXT_PUBLIC_MONAD_ROUTER_ADDRESS` / `NEXT_PUBLIC_CELO_ROUTER_ADDRESS` / `NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS`
- `NEXT_PUBLIC_*_POOL_USDC_ADDRESS`, `..._USDT_...`, etc.
- `NEXT_PUBLIC_*_DEPOSIT_VERIFIER_ADDRESS`

## Front flow

1. User picks token + amount (human decimals).
2. App creates **one note** with `createNote(amountRaw, ...)`.
3. App requests `/api/generate-deposit-proof`.
4. Approve router for **gross** (`notes + fee`). On Monad+WMON: `msg.value = amount + fee`.
5. `router.deposit` / `depositNative` — pool gets note `amount`, treasury gets fee.
6. Note stored with `token_symbol` + `pool_address` → backend syncs Merkle tip (`registerRoot`).
7. Claim: destination address (default = connected wallet; one-time coachmark), Merkle tree **for that pool**, wait for registered root, withdraw proof, `router.withdraw` (optional Alchemy AA).

## Migration note

Legacy pools that only accepted **1 USDC** notes are **not migrated**. Notes created against old pools cannot be claimed on the new multi-token pools. Redeploy clean and start fresh.

## Tests

```bash
cd zk
forge test --match-contract ShieldedPoolTest -vv
```

Covers: amount mismatch revert, exact withdraw, nullifier reuse, pool isolation, router ERC-20 + native deposit.
