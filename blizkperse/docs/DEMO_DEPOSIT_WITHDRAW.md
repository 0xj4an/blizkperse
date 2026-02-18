# Demo: Deposit (wallet A) y Withdraw (wallet B)

Lista de pasos y comandos para compilar circuitos, desplegar contratos y ejecutar una demo: **wallet A** deposita 1 USDC (creando una nota para B); **wallet B** retira ese 1 USDC a su dirección.

---

## Requisitos previos

- **Node.js** (para los scripts `.mjs`)
- **Forge** (Foundry)
- **Nargo** (Noir), p. ej. `noirup`
- **Barretenberg** (`bb`), p. ej. vía [bbup](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/bbup)
- **Wallet A:** con USDC y ETH (gas) en la red destino
- **Wallet B:** con ETH (gas); no necesita USDC (recibirá 1 USDC en el withdraw)

---

## 1. Variables de entorno

Crea o edita `.env` en la raíz del repo:

```bash
# Deploy (Forge)
PRIVATE_KEY=          # Clave del deployer (p. ej. la de A para simplificar)
USDC_ADDRESS=         # USDC en la red (Monad: 0x754704bc059f8c67012fed69bc8a327a5aafb603 u otra)
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

## Notas

- **A** y **B** pueden ser la misma wallet para pruebas; para la demo “deposit con A, withdraw con B” usas dos claves distintas.
- El **recipient** del withdraw es público on-chain; **quién tenía la nota** (B en este caso) queda oculto tras la prueba ZK.
- Si `prove_withdraw.sh` falla por la ruta del witness, revisa la salida de `nargo execute -p WithdrawProver` y ajusta `WITNESS_PATH` dentro del script.
