# Probar Deposit y Withdraw (validar anonimato)

Guía para validar el flujo deposit → withdraw y qué datos son anónimos on-chain.

---

## Cómo explicar: Register Root y Withdraw

### Register Root

**Qué es:** La pool mantiene una lista de **roots de Merkle** que considera válidos. Un root es el hash raíz de un árbol de Merkle cuyas hojas son los commitments de las notas (depósitos).

**Para qué sirve:** Cuando alguien hace **withdraw**, el circuito ZK demuestra “tengo una nota que está en un árbol con este root”. El contrato solo acepta la prueba si ese root está **registrado**. Así la pool sabe que el root corresponde a un estado del árbol que ella reconoce (p. ej. uno computado off-chain o por un indexer).

**Quién registra:** En este MVP, **cualquiera** puede llamar `registerRoot(root)`. No mueve fondos; solo añade el root a la whitelist. Para producción se restringiría (solo indexer, solo admin, o roots derivados on-chain).

**Resumen en una frase:** “Register root = decirle a la pool: este hash de estado del árbol de notas es válido; las pruebas de withdraw que usen este root serán aceptadas.”

---

### Withdraw

**Qué es:** Sacar **1 USDC** de la pool y enviarlo a una **address pública** (recipient). Quien retira demuestra con una **prueba ZK** que posee una nota válida (conoce los secretos y la nota está en el árbol con un root registrado), sin revelar qué nota es ni quién era el dueño.

**Flujo en corto:**
1. El usuario tiene una “nota” (derecho a 1 USDC) con nullifier N y que está en un árbol con root R.
2. Genera una prueba ZK que demuestra: “conozco una nota con valor 1, nullifier N, incluida en un árbol con root R, y quiero enviar el USDC a la address X”.
3. Llama `pool.withdraw(proof, publicInputs)`. Los public inputs son: valor, nullifier, longitud del path Merkle, root esperado, recipient.
4. La pool comprueba la prueba con el WithdrawVerifier, que el root R esté registrado, que el nullifier no se haya gastado y que el valor sea 1; luego marca N como gastado y envía 1 USDC a X.

**Qué es público y qué es privado:**
- **Público (on-chain):** el **recipient** (quién recibe el USDC), el **nullifier** (para no doble gastar) y el root usado.
- **Privado:** **quién tenía la nota** (quién generó la prueba). Un observador no puede ligar el withdraw a un depósito ni a una identidad concreta.

**Resumen en una frase:** “Withdraw = demostrar con ZK que tienes una nota válida y retirar 1 USDC a la address que elijas; quien tenía la nota sigue siendo anónimo.”

---

## Variables de entorno

En `.env` o exportadas:

```bash
export MONAD_RPC="https://rpc3.monad.xyz"
export PRIVATE_KEY="0x..."
export POOL_ADDRESS="0xD850AF48bDdf6E568A994a870aA684B86Bb5054f"   # tu pool desplegada
export USDC_ADDRESS="0x754704bc059f8c67012fed69bc8a327a5aafb603"  # USDC en Monad (ajusta si aplica)
```

---

## 1. Probar Deposit

### Qué es anónimo en deposit

- **Visible on-chain:** `msg.sender` (quién envía el 1 USDC y hace el `deposit`).
- **Privado (solo en la nota):** el **destinatario de la nota** (pk_b). Quién puede gastar esa nota más adelante no se ve en chain; solo el commitment.

### Pasos

1. Asegúrate de tener al menos 1 USDC en la wallet que usa `PRIVATE_KEY`.

2. Un solo depósito (pago A→B para índice 0):

   ```bash
   PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs
   ```

   Para más depósitos demo (A→B, A→C, …):

   ```bash
   PAYMENT_INDEX=1 node circuits/scripts/deposit_one.mjs   # A→C
   PAYMENT_INDEX=2 node circuits/scripts/deposit_one.mjs   # A→B
   # ...
   ```

3. Comprobar on-chain:
   - En el explorador: la tx de `deposit` muestra tu address como `from`.
   - El commitment es un `bytes32` opaco; no revela el destinatario de la nota (B/C).

Con esto validas: **deposit funciona y el dueño de la nota (destinatario) sigue siendo anónimo.**

---

## 2. Probar Withdraw

### Qué es anónimo en withdraw

- **Visible on-chain:** el **recipient** (address que recibe el 1 USDC) y el **nullifier** (para no doble gastar).
- **Privado:** **quién tenía la nota** (quién conoce pk_b/random y generó la prueba). El proof ZK demuestra “tengo una nota válida” sin revelar qué nota ni qué identidad.

### Prerrequisitos

- Pool desplegada **con** `WithdrawVerifier` (como en tu deploy).
- El **root** que usa el circuito withdraw debe estar registrado en la pool (ver paso 2.1).
- Proof del circuito withdraw en formato Honk (mismo que el verifier on-chain).

**Nota:** Hoy el `WithdrawVerifier` en `Verifier.sol` usa la misma verification key que el transfer (4 public inputs). El circuito withdraw tiene **5** public inputs. Hasta integrar la verification key real del withdraw (5 inputs), la llamada a `withdraw()` fallará en el verifier. Los pasos siguientes sirven para dejar el flujo listo y probar cuando esa key esté integrada.

### 2.1 Registrar el root

El withdraw prueba inclusión en un Merkle tree; el root debe estar registrado:

```bash
node circuits/scripts/register_root.mjs
```

Usa por defecto el `expected_merkle_root` de `circuits/WithdrawProver.toml`. Si usas otro root, pásalo con `ROOT=0x... node circuits/scripts/register_root.mjs`.

### 2.2 Generar proof de withdraw (cuando tengas Honk para withdraw)

1. En `circuits/`, con el circuito withdraw como main (p. ej. con `compile_withdraw_verifier.sh` o cambiando temporalmente a `withdraw.nr` como main):
   - Generar witness y proof en formato Honk (507 field elements, 32 bytes cada uno).
   - Escribir el proof en hex en un fichero (p. ej. `circuits/proofs/withdraw.proof`).
   - Los public inputs del withdraw en orden:  
     `[value, nullifier, merkle_proof_length, expected_merkle_root, recipient]`.

2. Valores de ejemplo (para PAYMENT_INDEX=0) están en `WithdrawProver.toml`; `nullifier` y `expected_merkle_root` se pueden obtener con:

   ```bash
   cd circuits && ./scripts/run_nullifier_helper.sh
   ```

### 2.3 Llamar withdraw on-chain

Con proof y public inputs listos:

```bash
# Proof en hex (0x + 64*507 caracteres)
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

O pasando los 5 public inputs a mano (orden: value, nullifier, merkle_proof_length, expected_merkle_root, recipient):

```bash
WITHDRAW_VALUE=0x1 \
NULLIFIER=0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400 \
MERKLE_PROOF_LENGTH=1 \
EXPECTED_ROOT=0x1364dee863ea150a4774ed9bc287bd4a4b7bec30e86f6bc29decf65a3b3bc4aa \
RECIPIENT=0x0000000000000000000000001234567890123456789012345678901234567890 \
PROOF_FILE=circuits/proofs/withdraw.proof \
node circuits/scripts/withdraw_one.mjs
```

`RECIPIENT` es el address como bytes32 (20 bytes de address + padding a 32).

Cuando el verifier del withdraw acepte 5 public inputs, esta llamada enviará 1 USDC a `recipient` y marcará el nullifier como gastado.

---

## Resumen anonimato

| Acción   | Visible on-chain                         | Privado / anónimo                          |
|----------|------------------------------------------|--------------------------------------------|
| Deposit  | Quién deposita (msg.sender)              | Destinatario de la nota (quién puede gastar) |
| Withdraw | A qué address se envía (recipient), nullifier | Quién tenía la nota (quién generó el proof)   |

Así validas que el deposit y el withdraw funcionan y qué parte del flujo sigue siendo anónima.
