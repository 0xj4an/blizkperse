# Build y deploy del Verifier (evitar SumcheckFailed)

**Registro de roots:** En el contrato actual, `registerRoot` es **permissionless** (cualquiera puede llamarlo). Al hacer claim, el frontend intenta registrar el root antes del withdraw; si es nuevo, la misma wallet que reclama paga el gas. No hace falta ejecutar scripts manualmente ni estar disponible como owner.

**Problema:** Si el WithdrawVerifier desplegado no se generó con el **mismo** circuito y los **mismos** flags que usa el API (`/api/generate-proof`), el withdraw desde el front falla con `SumcheckFailed()`.

**Regla:** Una sola fuente de verdad. El API y los scripts en `zk/circuits` deben usar exactamente el mismo flujo de proof (mismo `bb prove`, mismo `--oracle_hash keccak`). El verifier desplegado debe compilarse desde este repo y redesplegarse cada vez que cambies el circuito.

---

## Checklist antes de deploy / después de cambiar el circuito

1. **Compilar el verifier desde este repo**
   ```bash
   cd zk/circuits
   ./scripts/compile_withdraw_verifier.sh
   ```
   - Usa `withdraw.nr` como main, genera `zk/contract/WithdrawVerifier.sol`.
   - Escribe un **fingerprint** en `.verifier-build-id` y `zk/contract/.verifier-build-id` (hash del artefacto).
   - Ejecuta un **smoke test**: genera un proof y corre `bb verify`. Si falla, no despliegues.

2. **Comprobar que el API usa los mismos flags**
   - En `web/app/api/generate-proof/route.ts`, el comando debe ser:
     `bb prove -b ./target/with_foundry.json -w ... -o ... --oracle_hash keccak`
   - Si falta `--oracle_hash keccak`, los proofs del API no verificarán con el contrato.

3. **Desplegar el nuevo WithdrawVerifier**
   - Despliega `zk/contract/WithdrawVerifier.sol` (o el que haya en tu flujo de deploy).
   - Actualiza la pool para que use la nueva dirección del verifier (o redepliega la pool con esa dirección).

4. **No desplegar un verifier compilado en otra máquina / otro clone**
   - A menos que tengas el mismo `target/with_foundry.json` (mismo hash que `.verifier-build-id`), no uses ese verifier con este front.

---

## Qué hace el script de compilación

- Guarda `main.nr`, pone `withdraw.nr` como main.
- `nargo compile` → `target/with_foundry.json`
- `bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak` → `target/vk`
- `bb write_solidity_verifier` → `WithdrawVerifier.sol`
- Calcula el fingerprint (SHA256 de `with_foundry.json`) y lo guarda en `.verifier-build-id`.
- **Smoke test:** `nargo execute -p WithdrawProver`, `bb prove ... --oracle_hash keccak`, `bb verify ... --oracle_hash keccak`. Si verify falla, el script sigue pero muestra warning.
- Restaura `main.nr`.

---

## Si sigues teniendo SumcheckFailed

1. Vuelve a ejecutar `./scripts/compile_withdraw_verifier.sh` en `zk/circuits`.
2. Comprueba que el smoke test imprima "proof verified OK".
3. Redespliega el WithdrawVerifier y actualiza la pool.
4. Confirma que en el API el `bb prove` lleva `--oracle_hash keccak` (mismo que en el script).

---

## Referencia rápida: mismo flujo en CLI y en API

| Paso        | Scripts (deposit_one + prove_withdraw + withdraw_one) | API generate-proof        |
|------------|-------------------------------------------------------|---------------------------|
| Circuito   | `main.nr` = withdraw (o `prove_withdraw.sh` copia withdraw a main) | `main.nr` en `zk/circuits` (debe ser withdraw) |
| Witness    | `nargo execute -p WithdrawProver`                     | `nargo execute proof_<id>` + Prover.toml escrito por el API |
| Proof      | `bb prove ... --oracle_hash keccak`                   | `bb prove ... --oracle_hash keccak` (obligatorio) |
| Verifier   | Mismo `target/vk` y WithdrawVerifier.sol de este build | Contrato desplegado desde este build |

---

## Desplegar una nueva ShieldedPool (registerRoot permissionless)

Cuando hayas cambiado el contrato (p. ej. `registerRoot` permissionless) y quieras desplegar una **nueva** pool:

### 1. Variables en `zk/.env`

Asegúrate de tener:

- `PRIVATE_KEY` — clave del deployer (con MON para gas).
- `USDC_ADDRESS` — en Monad suele ser `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`.
- `MONAD_RPC` — p. ej. `https://rpc3.monad.xyz`.

### 2. Deploy desde `zk/`

```bash
cd zk
source .env   # o export PRIVATE_KEY=... USDC_ADDRESS=... MONAD_RPC=...
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

El script despliega tres contratos: **HonkVerifier** (transfer), **WithdrawVerifier**, **ShieldedPool**. Anota las **tres direcciones** (consola o txs en el explorador de Monad).

### 3. Bloque de deploy

Apunta el **número de bloque** de la tx que creó la pool (explorador de Monad). Lo usarás como `deployBlock` en el frontend para indexar eventos desde el inicio.

### 4. Actualizar `zk/.env`

Pon la nueva pool en:

```bash
POOL_ADDRESS=0x...   # dirección de la ShieldedPool del paso 2
```

Así los scripts CLI (`deposit_one.mjs`, `register_root.mjs`, etc.) usan la nueva pool.

### 5. Actualizar el frontend (`web/lib/constants.ts`)

En la config de Monad (id 143):

- `contracts.pool` → dirección de la **ShieldedPool** del paso 2.
- `contracts.verifier` → dirección del **HonkVerifier** desplegado en el mismo run.
- `contracts.withdrawVerifier` → dirección del **WithdrawVerifier** desplegado en el mismo run.
- `deployBlock` → número de bloque del paso 3 (ej. `BigInt(58_000_000)`).

Las tres direcciones salen en la salida de `forge script` o en las transacciones del explorador (orden: Verifier, WithdrawVerifier, ShieldedPool).

### 6. Listo

La nueva pool tiene `registerRoot` permissionless. Los usuarios pueden hacer claim desde la web; el primer claim que use un root nuevo lo registrará automáticamente.

---

## Desplegar en Celo

El mismo script `Deploy.s.sol` sirve para Celo. La pool usa **1 USDC (6 decimals)** por nota; en Celo debes usar el **USDC de Circle** (6 decimals), no USDm (18 decimals).

### 1. Variables en `zk/.env`

- `PRIVATE_KEY` — deployer (con CELO para gas).
- `USDC_ADDRESS` — **USDC en Celo:** `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6 decimals).
- `CELO_RPC` — p. ej. `https://forno.celo.org`.

### 2. Deploy desde `zk/`

```bash
cd zk
source .env
export USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C   # Celo USDC (opcional si ya está en .env)
forge script script/Deploy.s.sol:DeployPool --rpc-url "$CELO_RPC" --broadcast
```

Anota las **tres direcciones** (Verifier, WithdrawVerifier, ShieldedPool) y el **bloque** de la primera tx.

### 3. Actualizar el frontend (`web/lib/constants.ts`)

En la config de **Celo** (id 42220):

- `contracts.pool` → dirección de la ShieldedPool desplegada.
- `contracts.verifier` → dirección del HonkVerifier.
- `contracts.withdrawVerifier` → dirección del WithdrawVerifier.
- `contracts.stablecoin` → mantener `CELO_USDC` (o el token que uses; debe ser 6 decimals para que coincida con el contrato).
- `poolTokenDecimals` → `6`.
- `poolDenomination` → `BigInt(1_000_000)` (1e6).
- `deployBlock` → bloque del deploy (ej. `BigInt(25_000_000)`).
- `placeholder` → `false`.

### 4. Scripts CLI para Celo

Los scripts en `circuits/scripts/` usan `MONAD_RPC` y `POOL_ADDRESS` por defecto. Para usarlos en Celo tendrías que pasar un RPC y pool de Celo (p. ej. variables `CELO_RPC` y `CELO_POOL_ADDRESS` y que los scripts las soporten, o ejecutar con `POOL_ADDRESS=<pool_celo>` y un RPC de Celo). Opcional: duplicar/adaptar scripts o usar el frontend para depósitos y claims en Celo.

### 5. Resumen

| Paso | Acción |
|------|--------|
| 1 | `.env` con `PRIVATE_KEY`, `USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C`, `CELO_RPC` |
| 2 | `forge script script/Deploy.s.sol:DeployPool --rpc-url "$CELO_RPC" --broadcast` |
| 3 | Anotar verifier, withdrawVerifier, pool y bloque |
| 4 | Actualizar `web/lib/constants.ts` (Celo: pool, verifier, withdrawVerifier, deployBlock, placeholder: false, poolTokenDecimals: 6, poolDenomination: 1e6) |
