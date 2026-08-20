# Build and deploy the Verifier (avoiding SumcheckFailed)

**Root registration (current multi-pool model):** `ShieldedPool.registerRoot` is **registrar-only**. The web backend (`POST /api/sync-pool-root` + `ROOT_REGISTRAR_PRIVATE_KEY`) rebuilds the Merkle tip from on-chain deposits and registers it. Claims **must not** call `registerRoot` from the user wallet. See [arbitrary-amounts-multitoken.md](arbitrary-amounts-multitoken.md).

**Problem:** If the deployed WithdrawVerifier was not generated with the **same** circuit and the **same** flags that the API uses (`/api/generate-proof`), the withdraw from the frontend fails with `SumcheckFailed()`.

**Rule:** A single source of truth. The API and the scripts in `zk/circuits` must use exactly the same proof flow (same `bb prove`, same `--oracle_hash keccak`). The deployed verifier must be compiled from this repo and redeployed every time you change the circuit.

---

## Checklist before deploy / after changing the circuit

1. **Compile the verifier from this repo**
   ```bash
   cd zk/circuits
   ./scripts/compile_withdraw_verifier.sh
   ```
   - Uses `withdraw.nr` as main, generates `zk/contract/WithdrawVerifier.sol`.
   - Writes a **fingerprint** to `.verifier-build-id` and `zk/contract/.verifier-build-id` (artifact hash).
   - Runs a **smoke test**: generates a proof and runs `bb verify`. If it fails, do not deploy.

2. **Verify that the API uses the same flags**
   - In `web/app/api/generate-proof/route.ts`, the command must be:
     `bb prove -b ./target/with_foundry.json -w ... -o ... --oracle_hash keccak`
   - If `--oracle_hash keccak` is missing, proofs from the API will not verify with the contract.

3. **Deploy the new WithdrawVerifier**
   - Deploy `zk/contract/WithdrawVerifier.sol` (or whichever is in your deploy flow).
   - Update the pool to use the new verifier address (or redeploy the pool with that address).

4. **Do not deploy a verifier compiled on another machine / another clone**
   - Unless you have the same `target/with_foundry.json` (same hash as `.verifier-build-id`), do not use that verifier with this frontend.

---

## What the compilation script does

- Saves `main.nr`, sets `withdraw.nr` as main.
- `nargo compile` → `target/with_foundry.json`
- `bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak` → `target/vk`
- `bb write_solidity_verifier` → `WithdrawVerifier.sol`
- Calculates the fingerprint (SHA256 of `with_foundry.json`) and saves it to `.verifier-build-id`.
- **Smoke test:** `nargo execute -p WithdrawProver`, `bb prove ... --oracle_hash keccak`, `bb verify ... --oracle_hash keccak`. If verify fails, the script continues but shows a warning.
- Restores `main.nr`.

---

## If you still get SumcheckFailed

1. Run `./scripts/compile_withdraw_verifier.sh` again in `zk/circuits`.
2. Verify that the smoke test prints "proof verified OK".
3. Redeploy the WithdrawVerifier and update the pool.
4. Confirm that in the API the `bb prove` includes `--oracle_hash keccak` (same as in the script).

---

## Quick reference: same flow in CLI and API

| Step        | Scripts (deposit_one + prove_withdraw + withdraw_one) | API generate-proof        |
|------------|-------------------------------------------------------|---------------------------|
| Circuit   | `main.nr` = withdraw (or `prove_withdraw.sh` copies withdraw to main) | `main.nr` in `zk/circuits` (must be withdraw) |
| Witness    | `nargo execute -p WithdrawProver`                     | `nargo execute proof_<id>` + Prover.toml written by the API |
| Proof      | `bb prove ... --oracle_hash keccak`                   | `bb prove ... --oracle_hash keccak` (mandatory) |
| Verifier   | Same `target/vk` and WithdrawVerifier.sol from this build | Contract deployed from this build |

---

## Deploying pools (multi-token)

Prefer **[arbitrary-amounts-multitoken.md](arbitrary-amounts-multitoken.md)**:

1. `DeployDepositVerifier`
2. `DeployMultiPool` with `TOKEN_ADDRESSES`, `FEE_BPS`, `TREASURY_ADDRESS`, `ROOT_REGISTRAR_ADDRESS`
3. Optional `AddPool.s.sol` for an extra token on an existing router
4. Point web `NEXT_PUBLIC_*_ROUTER_ADDRESS` / `*_POOL_*_ADDRESS` / verifiers + `ROOT_REGISTRAR_PRIVATE_KEY`

Legacy `DeployPool` (single USDC, permissionless root) is obsolete for production.

### Env reminders (any chain)

- `PRIVATE_KEY` — deployer / owner
- `TREASURY_ADDRESS`, `FEE_BPS`
- `ROOT_REGISTRAR_ADDRESS` (+ web `ROOT_REGISTRAR_PRIVATE_KEY`)
- `TOKEN_ADDRESSES` (comma-separated)
- `WRAPPED_NATIVE` — Monad WMON only; **unset on Celo**

After deploy, record the **deploy block** for event indexing (`NEXT_PUBLIC_*_DEPLOY_BLOCK`).

### Celo notes

Use Celo ERC-20 token addresses (USDT, USDC, COPm, CELO GoldToken). Do **not** set `WRAPPED_NATIVE` or call `depositNative`. Defaults: [`web/lib/constants.ts`](../../web/lib/constants.ts).

---

## Deploying the web app on Railway

The app uses a **Dockerfile** at the repo root so that proof generation works in production.

### What the Dockerfile does

1. **Builder stage:** Installs **nargo** and **bb**, copies `zk/circuits/`, runs `nargo compile` to produce `target/with_foundry.json`, then builds Next.js (`web/`) in standalone mode (`--webpack`).
2. **Runner stage:** Copies nargo + bb, the compiled circuit dir (as `/app/circuits`), and the Next.js standalone app. Sets `CIRCUITS_DIR=/app/circuits` so the API finds the circuit.

### Railway config

- `railway.toml`: `builder = "DOCKERFILE"`, `dockerfilePath = "Dockerfile"`.
- **Root Directory (UI): leave blank / `/`** — the Dockerfile does `COPY web/` and `COPY zk/circuits/` from the monorepo root. If Root Directory is `web`, the build fails with `"/web": not found`.
- Set build-time `NEXT_PUBLIC_*` and runtime `ROOT_REGISTRAR_PRIVATE_KEY`, `DATABASE_URL`.

### Checklist so the flow does not fail on Railway

| Check | Why |
|-------|-----|
| **Root Directory empty (not `web`)** | Build context must be the repo root so `COPY web/` and `COPY zk/circuits/` resolve. |
| **`zk/circuits/src/main.nr` is the withdraw circuit** | Docker only runs `nargo compile` (no script). If `main.nr` were another circuit, `with_foundry.json` would not match the deployed WithdrawVerifier → SumcheckFailed. |
| **Build passes the `target/with_foundry.json` check** | The Dockerfile runs `test -f target/with_foundry.json` after compile; if it fails, the image is not built. |
| **API timeouts** | `/api/generate-proof` has `maxDuration = 120` and `/api/deposit-events` has `maxDuration = 60`. |
| **Postgres** | Set `DATABASE_URL` in Railway env. |
| **Memory** | Proof generation can use ~1 GB RAM. |

### If proof generation fails on Railway

1. **"Circuit directory not found"** → `CIRCUITS_DIR` must be `/app/circuits`.
2. **"nargo: command not found"** / **"bb: command not found"** → PATH must include nargo/bb bins from the image.
3. **Timeout / 504** → Increase `maxDuration` or plan resources.
4. **SumcheckFailed** → Redeploy WithdrawVerifier from `compile_withdraw_verifier.sh`; API must use `bb prove ... --oracle_hash keccak`.

---

## Do deposit and withdraw use local files?

| Step | Deposit (create payout) | Withdraw (claim) |
|------|-------------------------|------------------|
| **Notes / payments** | API → DB (`/api/payouts`, `/api/notes`) | API → DB (`/api/notes`) |
| **Merkle tree** | N/A | `/api/deposit-events` + RPC `Deposit` events for **that pool** |
| **Proof generation** | `/api/generate-deposit-proof` (deposit circuit) | `/api/generate-proof` writes temp files under `CIRCUITS_DIR`, runs `nargo` + `bb` |
| **Blockchain** | Router `deposit` / `depositNative` | Backend `registerRoot` (registrar); user/AA `router.withdraw` |

Summary: deposit/claim data lives in **DB + RPC**. Disk is only used for **proof generation** tooling.