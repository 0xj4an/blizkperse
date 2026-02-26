# Demo: Deposit (wallet A) y Withdraw (wallet B)

Lista de pasos y comandos para compilar circuitos, desplegar contratos y ejecutar una demo: **wallet A** deposita 1 USDC (creando una nota para B); **wallet B** retira ese 1 USDC a su dirección.

---

## Requisitos previos

- **Node.js** (para los scripts `.mjs`)
- **Forge** (Foundry)
- **Nargo** (Noir), p. ej. `noirup`
- **Barretenberg** (`bb`), p. ej. vía [bbup](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/bbup)
- **Wallet A:** con USDC y MON (gas) en Monad
- **Wallet B:** con MON (gas); no necesita USDC (recibirá 1 USDC en el withdraw)

---

## 1. Variables de entorno

Crea o edita `.env` en la raíz del repo:

```bash
# Deploy (Forge)
PRIVATE_KEY=          # Clave del deployer (p. ej. la de A para simplificar)
USDC_ADDRESS=0x754704Bc059F8C67012fEd69BC8A327a5aafb603  # Monad USDC (6 decimals)
MONAD_RPC=https://rpc3.monad.xyz

# Tras el deploy, rellenar con la nueva pool
POOL_ADDRESS=         # Se rellena después del paso 3
```

Para la demo usaremos:
- **Wallet A:** la que tenga USDC; hará el deposit (puede ser la misma que `PRIVATE_KEY` del deploy).
- **Wallet B:** la que hará el withdraw (debe ser la “dueña” de la nota: en el demo, la nota se crea para B con `pk_b=2`; B conoce los datos de la nota y genera el proof).

---

## 2. Compilar circuitos

Desde la **raíz del repo** (o `circuits/` según indique cada comando).

### 2.1 Circuito principal (transfer)

El verifier del transfer ya está en `contract/Verifier.sol`. Si cambiaste `main.nr`, compila:

```bash
cd circuits
nargo compile
cd ..
```

### 2.2 Circuito withdraw (verifier ya integrado)

El verifier del withdraw está integrado en `contract/Verifier.sol`. Solo necesitas compilar el circuito withdraw si vas a **generar un proof** más adelante:

```bash
cd circuits
./scripts/compile_withdraw_verifier.sh
cd ..
```

(Si solo haces deposit y no withdraw en esta demo, puedes saltar esto hasta el paso 6.)

---

## 3. Deploy de contratos

Desde la **raíz del repo**:

```bash
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

Anota la dirección de la **ShieldedPool** que imprima el script (o en `broadcast/.../run-latest.json`). Es la que usarás como `POOL_ADDRESS`.

---

## 4. Configurar POOL_ADDRESS

En tu `.env` (o exportando en la sesión):

```bash
export POOL_ADDRESS=0x...   # La dirección de la pool del paso 3
```

O edita `.env` y pon `POOL_ADDRESS=0x...`.

---

## 5. Registrar el root del withdraw

El withdraw exige que el `expected_merkle_root` esté registrado en la pool. Los scripts usan el root de `circuits/WithdrawProver.toml` por defecto.

Desde la **raíz del repo** (con `MONAD_RPC`, `PRIVATE_KEY`, `POOL_ADDRESS` en el entorno):

```bash
source .env
node scripts/register_root.mjs
```

Debe imprimir algo como `Root registered ✅`.

---

## 6. Demo – Deposit con wallet A

**Wallet A** deposita 1 USDC y crea una nota cuyo “dueño” es B (en el demo, `pk_b=2` para el primer pago).

Configura la sesión con la clave de **A** y la pool:

```bash
source .env
export PRIVATE_KEY=0x...    # Clave privada de la wallet A (con USDC)
export POOL_ADDRESS=0x...   # La pool desplegada
```

Un solo depósito (nota para B, índice 0):

```bash
PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs
```

Debe aparecer algo como: `Payment 1 (A→B), commitment: 0x...` y `deposit done ✅`.

Comprueba en el explorador que la tx de `deposit` la firma la wallet A y que la pool tiene 1 USDC más.

---

## 7. Demo – Withdraw con wallet B

**Wallet B** es la dueña de la nota (pk_b=2, random=100 para PAYMENT_INDEX=0). B genera el proof y envía la tx de withdraw; el 1 USDC va a la address que se ponga como `recipient` (p. ej. la propia B).

### 7.1 Generar el proof Honk (con datos de la nota de B)

Los valores por defecto de `WithdrawProver.toml` corresponden a esa nota (pk_b=2, random=100). Desde `circuits/`:

```bash
cd circuits
./scripts/prove_withdraw.sh
cd ..
```

Requisitos: `nargo` y `bb` instalados. El script deja el proof en hex en `circuits/proofs/withdraw.proof`.

Si quieres que el **recipient** sea la wallet B, edita `circuits/WithdrawProver.toml` y pon en `recipient` la address de B en formato bytes32 (0x + 40 hex de la address rellenada a 64 caracteres), por ejemplo:

```toml
recipient = "0x000000000000000000000000<20_bytes_de_la_wallet_B>"
```

Vuelve a ejecutar `./scripts/prove_withdraw.sh` tras cambiar `recipient`.

### 7.2 Enviar el withdraw con wallet B

Configura la sesión con la clave de **B** (y la misma pool). El script usa **B_PRIVATE_KEY** si está definida; si no, usa PRIVATE_KEY:

```bash
source .env
export B_PRIVATE_KEY=0x...  # Clave privada de la wallet B
export POOL_ADDRESS=0x...   # La misma pool
```

Ejecuta el script de withdraw (desde la raíz del repo):

```bash
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

Debe imprimir `withdraw tx: 0x...` y `Withdraw done ✅`. La pool envía 1 USDC al `recipient` configurado en el proof (p. ej. la wallet B).

---

## Resumen de comandos (copy-paste)

Asumiendo que ya tienes `.env` con `MONAD_RPC`, `USDC_ADDRESS`, `PRIVATE_KEY` (deployer), y que tras el deploy guardas la pool en `POOL_ADDRESS`:

```bash
# 1) Compilar circuito withdraw (para poder generar proof)
cd circuits && ./scripts/compile_withdraw_verifier.sh && cd ..

# 2) Deploy
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
# Anotar POOL_ADDRESS y ponerla en .env

# 3) Registrar root
export POOL_ADDRESS=0x...   # la nueva pool
node scripts/register_root.mjs

# 4) Deposit con wallet A
export PRIVATE_KEY=0x...    # clave de A (con USDC)
PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs

# 5) Generar proof (recipient en WithdrawProver.toml = B si quieres que B reciba)
cd circuits && ./scripts/prove_withdraw.sh && cd ..

# 6) Withdraw con wallet B
export B_PRIVATE_KEY=0x...  # clave de B (el script usa B_PRIVATE_KEY o PRIVATE_KEY)
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

---

## Withdraw de 2 depósitos (después de registrar un segundo root)

Si hiciste: **registerRoot(R1) → deposit → deposit → registerRoot(R2)** (dos roots registrados, R2 = árbol con 2 hojas), para retirar **cada una** de las 2 notas debes usar el **root R2** como `expected_merkle_root` y el **path de Merkle** correcto para cada nota.

- **Nota 0** (primer depósito, `PAYMENT_INDEX=0`): pk_b=2, random=100. En el árbol de 2 hojas, hoja 0 tiene hermano hoja 1; índice = 0 (izquierda).
- **Nota 1** (segundo depósito, `PAYMENT_INDEX=1`): pk_b=3, random=101. Hoja 1 tiene hermano hoja 0; índice = 1 (derecha).

### Script que prepara los datos

Desde `zk/circuits/`:

```bash
cd zk/circuits
node scripts/prepare_withdraw_two_notes.mjs
```

El script imprime el **root R2** y dos bloques **WithdrawProver.toml** (uno para nota 0 y otro para nota 1) con nullifier, `expected_merkle_root = R2`, `merkle_proof_length = 1`, e indices/siblings correctos.

### Pasos para retirar las 2 notas

1. **Registrar R2** si aún no está: `ROOT=<R2> node zk/scripts/register_root.mjs`
2. **Withdraw nota 0**: pega el bloque "Nota 0" en `WithdrawProver.toml` → `./scripts/prove_withdraw.sh` → `PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs` (con `B_PRIVATE_KEY`).
3. **Withdraw nota 1**: pega el bloque "Nota 1" en `WithdrawProver.toml` → mismo flujo (prove_withdraw.sh + withdraw_one.mjs). Usa la clave del dueño de la nota 1 (C si fue A→C).

Cada withdraw gasta un nullifier distinto.

### Recuperar commitments y root desde la chain

Si no sabes con qué datos se registró un root, puedes reconstruir el árbol desde los eventos **Deposit** on-chain y recalcular el root:

```bash
cd zk/circuits
MONAD_RPC=https://rpc3.monad.xyz node scripts/commitments_and_root_from_chain.mjs
```

Opcional: `FROM_BLOCK`, `TO_BLOCK`, `POOL_ADDRESS`. El script imprime: (1) lista de commitments en orden cronológico, (2) el Merkle root calculado (Poseidon2, depth 10), (3) para cada hoja el path (indices + siblings) para usar en `WithdrawProver.toml`. Si el root que imprime coincide con uno ya registrado, puedes usar ese root y el path de la hoja que sea tu nota (necesitas además el nullifier/pk_b/random de esa nota).

---

## Notas

- **A** y **B** pueden ser la misma wallet para pruebas; para la demo “deposit con A, withdraw con B” usas dos claves distintas.
- El **recipient** del withdraw es público on-chain; **quién tenía la nota** (B en este caso) queda oculto tras la prueba ZK.
- Si `prove_withdraw.sh` falla por la ruta del witness, revisa la salida de `nargo execute -p WithdrawProver` y ajusta `WITNESS_PATH` dentro del script.
