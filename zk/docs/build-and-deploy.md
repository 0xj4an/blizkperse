# Build and deploy the Verifier (avoiding SumcheckFailed)

**Root registration:** In the current contract, `registerRoot` is **permissionless** (anyone can call it). When claiming, the frontend attempts to register the root before the withdraw; if it is new, the same wallet that claims pays the gas. There is no need to run scripts manually or be available as owner.

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

## Deploying a new ShieldedPool (permissionless registerRoot)

When you have changed the contract (e.g. permissionless `registerRoot`) and want to deploy a **new** pool:

### 1. Variables in `zk/.env`

Make sure you have:

- `PRIVATE_KEY` -- deployer key (with MON for gas).
- `USDC_ADDRESS` -- on Monad it is usually `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`.
- `MONAD_RPC` -- e.g. `https://rpc3.monad.xyz`.

### 2. Deploy from `zk/`

```bash
cd zk
source .env   # or export PRIVATE_KEY=... USDC_ADDRESS=... MONAD_RPC=...
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

The script deploys three contracts: **HonkVerifier** (transfer), **WithdrawVerifier**, **ShieldedPool**. Note the **three addresses** (console or txs in the Monad explorer).

### 3. Deploy block

Note the **block number** of the tx that created the pool (Monad explorer). You will use it as `deployBlock` in the frontend to index events from the beginning.

### 4. Update `zk/.env`

Set the new pool in:

```bash
POOL_ADDRESS=0x...   # ShieldedPool address from step 2
```

This way the CLI scripts (`deposit_one.mjs`, `register_root.mjs`, etc.) use the new pool.

### 5. Update the web environment

Set these in `web/.env` or Railway env vars:

- `NEXT_PUBLIC_MONAD_POOL_ADDRESS` → **ShieldedPool** address from step 2.
- `NEXT_PUBLIC_MONAD_VERIFIER_ADDRESS` → **HonkVerifier** address deployed in the same run.
- `NEXT_PUBLIC_MONAD_WITHDRAW_VERIFIER_ADDRESS` → **WithdrawVerifier** address deployed in the same run.
- `NEXT_PUBLIC_MONAD_STABLECOIN_ADDRESS` → the USDC token used by the pool.
- `NEXT_PUBLIC_MONAD_DEPLOY_BLOCK` → block number from step 3.

All three addresses appear in the `forge script` output or in the explorer transactions.

### 6. Done

The new pool has permissionless `registerRoot`. Users can claim from the web; the first claim that uses a new root will register it automatically.

---

## Deploying on Celo

The same `Deploy.s.sol` script works for Celo. The pool uses **1 USDC (6 decimals)** per note; on Celo you must use **Circle's USDC** (6 decimals), not USDm (18 decimals).

### 1. Variables in `zk/.env`

- `PRIVATE_KEY` -- deployer (with CELO for gas).
- `USDC_ADDRESS` -- **USDC on Celo:** `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6 decimals).
- `CELO_RPC` -- e.g. `https://forno.celo.org`.

### 2. Deploy from `zk/`

```bash
cd zk
source .env
export USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C   # Celo USDC (optional if already in .env)
forge script script/Deploy.s.sol:DeployPool --rpc-url "$CELO_RPC" --broadcast
```

Note the **three addresses** (Verifier, WithdrawVerifier, ShieldedPool) and the **block** of the first tx.

### 3. Update the web environment

Set these in `web/.env` or Railway env vars:

- `NEXT_PUBLIC_CELO_POOL_ADDRESS` → deployed ShieldedPool address.
- `NEXT_PUBLIC_CELO_VERIFIER_ADDRESS` → HonkVerifier address.
- `NEXT_PUBLIC_CELO_WITHDRAW_VERIFIER_ADDRESS` → WithdrawVerifier address.
- `NEXT_PUBLIC_CELO_STABLECOIN_ADDRESS` → the 6-decimal USDC token used by the pool.
- `NEXT_PUBLIC_CELO_DEPLOY_BLOCK` → deploy block.

### 4. CLI scripts for Celo

The scripts in `circuits/scripts/` use `MONAD_RPC` and `POOL_ADDRESS` by default. To use them on Celo you would need to pass a Celo RPC and pool (e.g. variables `CELO_RPC` and `CELO_POOL_ADDRESS` and have the scripts support them, or run with `POOL_ADDRESS=<celo_pool>` and a Celo RPC). Optional: duplicate/adapt scripts or use the frontend for deposits and claims on Celo.

### 5. Summary

| Step | Action |
|------|--------|
| 1 | `.env` with `PRIVATE_KEY`, `USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C`, `CELO_RPC` |
| 2 | `forge script script/Deploy.s.sol:DeployPool --rpc-url "$CELO_RPC" --broadcast` |
| 3 | Note verifier, withdrawVerifier, pool, and block |
| 4 | Update `web/.env` / Railway env vars (Celo: pool, verifier, withdrawVerifier, stablecoin, deploy block) |

---

## Deploying the web app on Railway

The app uses a **Dockerfile** at the repo root so that proof generation works in production.

### What the Dockerfile does

1. **Builder stage:** Installs **nargo** (Noir 1.0.0-beta.18) and **bb** (Barretenberg 0.63.1), copies `zk/circuits/`, runs `nargo compile` to produce `target/with_foundry.json`, then builds Next.js (`web/`) in standalone mode.
2. **Runner stage:** Copies nargo + bb, the compiled circuit dir (as `/app/circuits`), and the Next.js standalone app. Sets `CIRCUITS_DIR=/app/circuits` so the API finds the circuit. Creates `circuits/proofs` for temp proof files.

### Railway config

- `railway.toml`: `builder = "DOCKERFILE"`, `dockerfilePath = "Dockerfile"`.
- **Root Directory (UI): leave blank / `/`** — the Dockerfile does `COPY web/` and `COPY zk/circuits/` from the monorepo root. If Root Directory is `web`, the build fails with `"/web": not found`.
- Dockerfile path: `Dockerfile` (repo root). Do not point the service at `web/` as the build root.
- No extra env vars are required for proof generation; `CIRCUITS_DIR` is set in the image.

### Checklist so the flow does not fail on Railway

| Check | Why |
|-------|-----|
| **Root Directory empty (not `web`)** | Build context must be the repo root so `COPY web/` and `COPY zk/circuits/` resolve. |
| **`zk/circuits/src/main.nr` is the withdraw circuit** | Docker only runs `nargo compile` (no script). If `main.nr` were another circuit, `with_foundry.json` would not match the deployed WithdrawVerifier → SumcheckFailed. |
| **Build passes the `target/with_foundry.json` check** | The Dockerfile runs `test -f target/with_foundry.json` after compile; if it fails, the image is not built. |
| **API timeouts** | `/api/generate-proof` has `maxDuration = 120` and `/api/deposit-events` has `maxDuration = 60` so long-running steps are not cut off. |
| **Postgres** | If you use Railway Postgres, set `DATABASE_URL` (or whatever the app expects) in Railway env. |
| **Memory** | Proof generation (nargo + bb) can use ~1 GB RAM; avoid the smallest plan if you see OOM. |

### If proof generation fails on Railway

1. **"Circuit directory not found"** → `CIRCUITS_DIR` must be `/app/circuits` in the running container (set in Dockerfile).
2. **"nargo: command not found"** or **"bb: command not found"** → PATH in the runner image must include `/root/.nargo/bin` and `/root/.bb` (Dockerfile copies these from builder).
3. **Timeout / 504** → Increase `maxDuration` in the route or upgrade the plan; confirm the request is not being killed by a proxy (e.g. 60s) before the API.
4. **SumcheckFailed** → The deployed WithdrawVerifier was built from a different circuit or flags. Compile the verifier with `zk/circuits/scripts/compile_withdraw_verifier.sh`, redeploy the contract, and ensure the API uses `bb prove ... --oracle_hash keccak`.

---

## ¿Deposit y withdraw usan archivos locales?

En local y en Railway el flujo es el mismo en cuanto a **origen de datos**:

| Paso | Deposit (pagar / crear payout) | Withdraw (claim) |
|------|-------------------------------|------------------|
| **Datos de notas / pagos** | No usa archivos. Los pagos y la nota se crean en memoria y se persisten vía **API → base de datos** (`/api/payouts`, `/api/notes`). | No usa archivos. Los datos de la nota vienen de **API → DB** (`/api/notes?payment_id=...` o `?subscriber_id=...`). |
| **Árbol de Merkle** | No aplica. | No usa archivos. El árbol se construye con datos que devuelve **`/api/deposit-events`**: esa ruta lee la tabla **`notes`** y la caché **`deposit_events_cache`** (DB) y, si hace falta, escanea la **RPC** (eventos `Deposit` del contrato). |
| **Generación del proof** | No aplica. | **Sí usa el disco** solo aquí: la ruta **`/api/generate-proof`** escribe `Prover.toml` en el directorio del circuito, ejecuta **`nargo execute`** y **`bb prove`** (que leen `target/with_foundry.json` y escriben `target/*.gz`, `proofs/*.proof`) y luego lee el proof generado. Ese directorio en local es `zk/circuits` y en Railway es `CIRCUITS_DIR` (p. ej. `/app/circuits`). |
| **Blockchain** | **RPC**: `depositToPool` (tx al pool). | **RPC**: `registerRoot` y `withdraw` (txs al pool). |

Resumen: **deposit no usa archivos locales**. **Withdraw** solo usa archivos en el paso de **generar el proof** (directorio del circuito con `nargo`/`bb`); el resto usa **DB** y **RPC**.
