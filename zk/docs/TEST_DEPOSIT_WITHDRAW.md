# Probar Deposit y Withdraw (validar anonimato)

Guía para validar el flujo deposit → withdraw y qué datos son anónimos on-chain.

---

## ¿Está todo listo para deploy? (Deposit + Withdraw)

**Sí.** Tras el deploy:

| Paso | Qué hacer |
|------|-----------|
| 1. Deploy | `source .env && forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast` |
| 2. Actualizar pool | En `.env` (o en los scripts) pon el **nuevo** `POOL_ADDRESS` que devuelve el deploy (o los scripts usarán el default si no lo cambias; si redepliegas, el default en código es la pool anterior — mejor setear la nueva). |
| 3. Registrar root | Opcional: desde la **web**, el primer usuario que hace claim registra el root automáticamente (el contrato permite que cualquiera llame `registerRoot`). Para pruebas por CLI: `node scripts/register_root.mjs` si quieres pre-registrar un root. |
| 4. Deposit | Listo: `PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs` (con USDC y PRIVATE_KEY). |
| 5. Withdraw | El contrato ya acepta 5 public inputs. Genera un proof Honk con `circuits/scripts/prove_withdraw.sh` (requiere `bb`) y luego `PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs`. Ver más abajo **“Cómo generar un proof Honk del circuito withdraw”**. |

Si es la **primera vez** que deploys (o si redepliegas), la pool nueva empieza vacía (sin depósitos previos). Tendrás que hacer al menos un deposit en esa pool antes de poder hacer withdraw de una nota.

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

## Los 5 public inputs y cómo funciona el withdraw

### Por qué 5 inputs

En el circuito **withdraw** (Noir) hay exactamente **5 valores públicos**: son los que el circuito “expone” y que el contrato en Solidity debe recibir para comprobar la prueba y ejecutar el retiro. Esos 5 son los **public inputs** del withdraw.

| # | Public input | Qué es | Para qué sirve on-chain |
|---|----------------|--------|--------------------------|
| 0 | **value** | Valor de la nota (1 USDC) | La pool exige `value == 1`; solo retiros de 1 USDC. |
| 1 | **nullifier** | Hash que identifica el gasto de esa nota | Se guarda en `nullifiers`; no se puede usar dos veces (evita doble gasto). |
| 2 | **merkle_proof_length** | Longitud del path de la prueba Merkle | El circuito lo usa para verificar inclusión; el contrato no lo usa aparte de pasarlo al verifier. |
| 3 | **expected_merkle_root** | Root del árbol donde está la nota | La pool comprueba que esté en `isKnownRoot`; si no está registrado, rechaza. |
| 4 | **recipient** | Address que recibe el USDC (como Field/bytes32) | La pool hace `transfer(recipient, 1 USDC)`; es quien cobra. |

El **orden** tiene que ser exactamente ese: es el que define el circuito y el que usa `ShieldedPool.withdraw(proof, publicInputs)`.

### Dónde salen los 5

- Los fijas **tú** (o tu app) cuando generas la prueba:
  - **value** = 1.
  - **nullifier** = derivado de la nota (p. ej. Poseidon(random, pk_b)); lo calculas con los mismos datos que el circuito.
  - **merkle_proof_length** = longitud del path que usas en el árbol (p. ej. 1 en el demo).
  - **expected_merkle_root** = root del árbol en el que demuestras que está tu nota (debe estar registrado con `registerRoot`).
  - **recipient** = address destino en formato bytes32 (20 bytes de address + padding).
- El **circuito** comprueba internamente que esos valores son coherentes con los inputs privados (pk_b, random, merkle path, etc.) y genera una **prueba ZK** atada a esos 5 públicos.
- El **contrato** recibe los mismos 5 como `publicInputs` y:
  1. Comprueba `value == 1`, `isKnownRoot[root]`, `!nullifiers[nullifier]`.
  2. Llama a `withdrawVerifier.verify(proof, publicInputs)`.
  3. Si la verificación pasa, marca el nullifier como gastado y envía 1 USDC a `recipient`.

### El detalle de “5” en el verifier (20 vs 21)

El verifier Honk en Solidity no trabaja solo con “5”, sino con un **tamaño total** que incluye los public inputs más unos datos internos del protocolo (pairing):

- **En el circuito:** hay 5 public inputs.
- **En el verifier (Honk):** la verification key tiene un campo `publicInputsSize`. En nuestro código:
  - **20** = 4 public inputs “reales” + 16 (pairing). Lo usa el verifier del **transfer**.
  - **21** = 5 public inputs “reales” + 16 (pairing). Lo usa el verifier del **withdraw**.

Por eso en `Verifier.sol`:

- `HonkVerificationKey` tiene `publicInputsSize: 20` → el verifier del transfer espera **4** public inputs.
- `WithdrawVerificationKey` pone `publicInputsSize: 21` → el verifier del withdraw espera **5** public inputs.

La constante `WITHDRAW_NUMBER_OF_PUBLIC_INPUTS = 5` es la que se usa en el constructor del `WithdrawVerifier` para que el transcript y las comprobaciones internas usen “5” como número de public inputs.

### Flujo completo en pocas líneas

1. **Off-chain:** Tienes una nota (value=1, pk_b, random, nullifier, y su commitment en un árbol con root R). Construyes los 5 public inputs (value, nullifier, merkle_proof_length, R, recipient) y los inputs privados (pk_b, random, path Merkle). Ejecutas el prover del circuito withdraw → obtienes **proof**.
2. **On-chain:** Llamas `pool.withdraw(proof, [value, nullifier, merkle_proof_length, expected_merkle_root, recipient])`.
3. **Contrato:** Comprueba value, root registrado y nullifier no gastado; llama `withdrawVerifier.verify(proof, publicInputs)`; si OK, marca nullifier y envía 1 USDC a `recipient`.

Así, los **5 inputs** son el “acuerdo” entre el circuito, la prueba y el contrato: mismos 5, en el mismo orden, para que el withdraw funcione y sea verificable on-chain.

---

## Qué queda privado y qué público (deposit vs withdraw)

### Deposit

En el **deposit** no hay circuito on-chain: solo se envía un **commitment** (hash de la nota). Todo lo que compone la nota se queda en tu cliente.

| Dato | ¿Público o privado? | Dónde |
|------|---------------------|--------|
| **msg.sender** (quién hace el depósito) | Público | On-chain en la tx |
| **commitment** | Público pero opaco | On-chain; es un hash, no revela el contenido |
| **value** (1 USDC) | Privado | Solo en tu app; forma parte del commitment |
| **pk_b** (destinatario de la nota, p. ej. B=2, C=3) | Privado | Solo en tu app; quien pueda gastar la nota no se ve |
| **random** | Privado | Solo en tu app; aleatoriedad de la nota |
| **nullifier** (derivado de random + pk_b) | Privado | Solo en tu app; lo usarás después en el withdraw |

Resumen: **privados** = value, pk_b, random, nullifier (toda la “nota” salvo el commitment). **Públicos** = quien deposita y el commitment (el commitment no revela a quién va la nota).

---

### Withdraw

En el **withdraw** el circuito tiene **public inputs** (los 5 que recibe el contrato) e **inputs privados** (solo entran en la prueba ZK, no on-chain).

| Dato | ¿Público o privado? | Dónde |
|------|---------------------|--------|
| **value** | Público | Public input 0 |
| **nullifier** | Público | Public input 1 (para no doble gastar) |
| **merkle_proof_length** | Público | Public input 2 |
| **expected_merkle_root** | Público | Public input 3 |
| **recipient** | Público | Public input 4 (quién recibe el USDC) |
| **pk_b** (identidad del dueño de la nota) | Privado | Solo en la prueba; no on-chain |
| **random** | Privado | Solo en la prueba; no on-chain |
| **merkle_proof_indices** | Privado | Solo en la prueba; path en el árbol |
| **merkle_proof_siblings** | Privado | Solo en la prueba; path en el árbol |

Resumen: **privados** = pk_b, random, merkle_proof_indices, merkle_proof_siblings (quién era el dueño de la nota y cómo está en el árbol). **Públicos** = los 5 inputs que recibe el contrato; entre ellos, el que más importa para privacidad es que **recipient** es público (se ve a quién se envía el USDC) y **quién tenía la nota** (pk_b) queda privado.

---

## ¿Puedo hacer withdraw con una wallet “limpia” y que el pago siga siendo privado?

Sí. La idea es:

1. **Tienes la nota** (conoces pk_b, random, el path Merkle, etc.) y generas la prueba off-chain.
2. **Envías la tx de withdraw** desde una **wallet que no tenga historial ligado a ti** (wallet nueva o dedicada). Esa wallet es el **msg.sender** de la tx; on-chain solo se ve “esta address envió una tx de withdraw”.
3. Pones como **recipient** (quién recibe el 1 USDC) la address que quieras: puede ser esa misma wallet limpia, otra nueva, o un exchange, etc.

**Qué ve un observador on-chain:**  
“La address X (msg.sender) llamó a `withdraw` y 1 USDC fue a la address Y (recipient).”  
**Qué no ve:**  
Quién era el dueño de la nota (pk_b), de qué depósito venía, ni ninguna relación con tu identidad “real”. No hay vínculo on-chain entre el depósito original y este withdraw.

**Matices:**

- **recipient es público.** Si retiras a una address asociada a ti (tu wallet principal, un CEX con KYC), se verá que ese address recibió 1 USDC; lo que no se ve es quién tenía la nota. Para más privacidad, retira a una address que no relacione contigo.
- **msg.sender (quien envía la tx)** también es público. Si usas una wallet limpia solo para enviar esta tx, ese wallet queda “asociado” a este withdraw. Si quieres desacoplar más, puedes usar un **relayer**: otra persona o servicio que envíe la tx por ti (ellos son msg.sender) y el **recipient** sea tu wallet; así quien cobra no es quien firma la tx.

En resumen: **sí, puedes ir a la pool a hacer withdraw con la nota y con una wallet sin historial ligado a ti, y el pago se mantiene privado** en el sentido de que no se puede ligar el retiro al depósito ni al dueño de la nota; solo conviene cuidar a qué address pones como recipient y, si quieres más capas, usar relayer para que quien firma la tx no sea quien recibe el USDC.

Hoy el **WithdrawVerifier** en `Verifier.sol` usa la misma verification key que el transfer (circuito principal). Esa key está hecha para **4 public inputs**; el circuito withdraw tiene **5** (value, nullifier, merkle_proof_length, expected_merkle_root, recipient). Por eso la llamada a `withdraw()` falla en el verifier. Para que el withdraw funcione de punta a punta hace falta lo siguiente.

### 1. Verification key real del withdraw (5 public inputs)

- Compilar el **circuito withdraw** con el backend que genera el verifier Honk:
  ```bash
  cd circuits && ./scripts/compile_withdraw_verifier.sh
  ```
- En el `Verifier.sol` generado (o en `WithdrawVerifier.sol`) vendrá una **verification key** distinta a la del transfer (con `publicInputsSize` = 21, es decir 5 + 16 pairing points).
- **Integrar esa key en `Verifier.sol`:**
  - Añadir una constante para withdraw, p. ej. `WITHDRAW_NUMBER_OF_PUBLIC_INPUTS = 5` (o 21 si el backend usa el total).
  - Crear una librería **WithdrawVerificationKey** que cargue la key generada para el circuito withdraw (copiando los valores del `Verifier.sol` que salga de compilar withdraw).
  - Hacer que el contrato **WithdrawVerifier** herede de `BaseZKHonkVerifier(N, LOG_N, 5)` (o el valor que use la base) y en `loadVerificationKey()` devuelva `WithdrawVerificationKey.loadVerificationKey()` en lugar de `HonkVerificationKey.loadVerificationKey()`.
- Redesplegar la pool (o solo el WithdrawVerifier si la pool ya apunta a una dirección que vayas a reemplazar).

### 2. Proof en formato Honk

- El proof debe ser el que produce el **prover Honk** para el circuito withdraw (mismo backend que el verifier).
- Formato esperado por el contrato: **507 field elements** de 32 bytes cada uno (mismo layout que el verifier del transfer).
- Si tu pipeline de pruebas genera el proof con otro formato, hace falta un paso que lo convierta al formato Honk que espera el Solidity verifier.

### 3. Condiciones on-chain (ya cubiertas si hiciste los pasos)

- **Root registrado:** el `expected_merkle_root` que usa la prueba debe estar registrado en la pool (`registerRoot`), como ya hiciste con `register_root.mjs`.
- **WithdrawVerifier desplegado:** la pool debe tener configurado `withdrawVerifier != address(0)` (en tu deploy ya está).
- **Nullifier no gastado:** el nullifier de la nota no puede haberse usado antes en otro withdraw.
- **USDC en la pool:** la pool debe tener al menos 1 USDC (p. ej. de un depósito previo).

### Resumen

| Requisito | Estado típico |
|-----------|----------------|
| Verification key withdraw (5 inputs) en Verifier.sol | Pendiente: compilar withdraw e integrar WithdrawVerificationKey |
| Proof Honk del circuito withdraw | Pendiente: generar con el prover correcto |
| Root registrado | Hecho con `register_root.mjs` |
| WithdrawVerifier desplegado | Hecho en tu deploy |
| Pool con USDC | Tras al menos un deposit |

Cuando la key del withdraw esté integrada y tengas un proof válido en formato Honk, `withdraw_one.mjs` podrá llamar a `pool.withdraw(proof, publicInputs)` y la tx debería completarse.

---

## Variables de entorno

En `.env` o exportadas:

```bash
export MONAD_RPC="https://rpc3.monad.xyz"
export PRIVATE_KEY="0x..."
export POOL_ADDRESS="0x085BD9c0C568BE5093130E2359B00e46cb0800d1"   # ShieldedPool on Monad Mainnet
export USDC_ADDRESS="0x754704Bc059F8C67012fEd69BC8A327a5aafb603"  # USDC on Monad (6 decimals)
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

### 2.2 Cómo generar un proof Honk del circuito withdraw

El verifier on-chain espera un proof en **formato Barretenberg/Honk**: mismo que genera la herramienta `bb` (Barretenberg CLI).

**Script que automatiza los pasos:** desde `circuits/` puedes ejecutar `./scripts/prove_withdraw.sh`. Requiere `nargo` y `bb` instalados. Si el witness o el artefacto tienen otro nombre en tu instalación, edita las rutas en el script. Si todo va bien, el proof en hex queda en `circuits/proofs/withdraw.proof`.

**Pasos manuales (por si el script falla o quieres ajustar):**

#### Requisitos

- **Noir:** `nargo` instalado (`noirup`).
- **Barretenberg:** CLI `bb` instalado (`bbup`, ver [README](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/bbup)).
- En `circuits/`, el circuito **withdraw** debe compilarse como programa principal (mismo que para el verifier).

#### Pasos (resumen)

1. **Compilar el circuito withdraw** (como en el verifier):
   ```bash
   cd circuits && ./scripts/compile_withdraw_verifier.sh
   ```
   Eso deja en `target/` el artefacto (p. ej. `with_foundry.json`) y restaura `main.nr`. Para probar necesitas de nuevo el circuito withdraw como main.

2. **Dejar withdraw como main y generar witness:**
   ```bash
   cd circuits
   cp src/main.nr src/main.nr.bak
   cp src/withdraw.nr src/main.nr
   nargo compile
   nargo execute -p WithdrawProver
   ```
   `WithdrawProver.toml` debe tener los 5 public inputs y los privados (pk_b, random, merkle path). El witness se escribe en `target/` (nombre según tu Nargo.toml, p. ej. asociado a `WithdrawProver`).

3. **Generar el proof con Barretenberg:**
   ```bash
   bb prove -b ./target/with_foundry.json -w ./target/WithdrawProver -o ./target --oracle_hash keccak
   ```
   (Ajusta `-w` si el witness tiene otro nombre/ruta; en algunos setups el artefacto o el witness tienen otro nombre.)

   `bb` escribe en `-o` (p. ej. `./target`) dos ficheros en **binario**: `proof` y `public_inputs`. El proof son 507 field elements × 32 bytes = 16 224 bytes.

4. **Convertir el proof a hex** para `withdraw_one.mjs` (que espera un fichero con proof en hex, tipo `0x...`):
   ```bash
   # Desde circuits/
   node -e "
   const fs = require('fs');
   const p = fs.readFileSync('./target/proof');
   fs.mkdirSync('./proofs', { recursive: true });
   fs.writeFileSync('./proofs/withdraw.proof', '0x' + p.toString('hex'));
   console.log('Proof hex escrito en proofs/withdraw.proof,', p.length, 'bytes');
   "
   ```

5. **Llamar al withdraw on-chain:**
   ```bash
   PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
   ```
   (O desde la raíz del repo, con `PROOF_FILE` apuntando a ese fichero.)

Si en tu instalación el nombre del artefacto o del witness es distinto (p. ej. otro nombre que `with_foundry` o `WithdrawProver`), cambia `-b` y `-w` según lo que genere `nargo compile` y `nargo execute`. El verifier Solidity que tienes es Honk; si usas otra versión de `bb` que genere otro formato, puede que tengas que usar la variante exacta que generó ese contrato (p. ej. `bb prove_ultra_honk` si aplica).

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
