# Testing Deposit and Withdraw (validate anonymity)

Guide to validate the deposit → withdraw flow and which data is anonymous on-chain.

---

## Is everything ready for deploy? (Deposit + Withdraw)

**Yes.** After deploy:

| Step | What to do |
|------|-----------|
| 1. Deploy | `source .env && forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast` |
| 2. Update pool | In `.env` (or in the scripts) set the **new** `POOL_ADDRESS` returned by the deploy (or the scripts will use the default if you don't change it; if you redeploy, the default in code is the previous pool -- better to set the new one). |
| 3. Register root | Optional: from the **web**, the first user who claims automatically registers the root (the contract allows anyone to call `registerRoot`). For CLI testing: `node scripts/register_root.mjs` if you want to pre-register a root. |
| 4. Deposit | Ready: `PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs` (with USDC and PRIVATE_KEY). |
| 5. Withdraw | The contract already accepts 5 public inputs. Generate a Honk proof with `circuits/scripts/prove_withdraw.sh` (requires `bb`) and then `PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs`. See below **"How to generate a Honk proof for the withdraw circuit"**. |

If this is the **first time** you deploy (or if you redeploy), the new pool starts empty (no previous deposits). You will need to make at least one deposit in that pool before you can withdraw a note.

---

## How to explain: Register Root and Withdraw

### Register Root

**What it is:** The pool maintains a list of **Merkle roots** that it considers valid. A root is the root hash of a Merkle tree whose leaves are the note commitments (deposits).

**What it's for:** When someone does a **withdraw**, the ZK circuit proves "I have a note that is in a tree with this root". The contract only accepts the proof if that root is **registered**. This way the pool knows that the root corresponds to a tree state it recognizes (e.g. one computed off-chain or by an indexer).

**Who registers:** In this MVP, **anyone** can call `registerRoot(root)`. It does not move funds; it only adds the root to the whitelist. For production this would be restricted (only indexer, only admin, or roots derived on-chain).

**One-sentence summary:** "Register root = telling the pool: this note tree state hash is valid; withdraw proofs that use this root will be accepted."

---

### Withdraw

**What it is:** Withdrawing **1 USDC** from the pool and sending it to a **public address** (recipient). The withdrawer proves with a **ZK proof** that they own a valid note (they know the secrets and the note is in the tree with a registered root), without revealing which note it is or who the owner was.

**Flow in short:**
1. The user has a "note" (right to 1 USDC) with nullifier N and that is in a tree with root R.
2. They generate a ZK proof that demonstrates: "I know a note with value 1, nullifier N, included in a tree with root R, and I want to send the USDC to address X".
3. They call `pool.withdraw(proof, publicInputs)`. The public inputs are: value, nullifier, Merkle path length, expected root, recipient.
4. The pool verifies the proof with the WithdrawVerifier, checks that root R is registered, that the nullifier has not been spent, and that the value is 1; then it marks N as spent and sends 1 USDC to X.

**What is public and what is private:**
- **Public (on-chain):** the **recipient** (who receives the USDC), the **nullifier** (to prevent double spending) and the root used.
- **Private:** **who held the note** (who generated the proof). An observer cannot link the withdraw to a deposit or to a specific identity.

**One-sentence summary:** "Withdraw = prove with ZK that you have a valid note and withdraw 1 USDC to the address of your choice; who held the note remains anonymous."

---

## The 5 public inputs and how withdraw works

### Why 5 inputs

In the **withdraw** circuit (Noir) there are exactly **5 public values**: these are the values the circuit "exposes" and that the Solidity contract must receive to verify the proof and execute the withdrawal. These 5 are the **public inputs** of the withdraw.

| # | Public input | What it is | What it's for on-chain |
|---|----------------|--------|--------------------------|
| 0 | **value** | Note value (1 USDC) | The pool requires `value == 1`; only 1 USDC withdrawals. |
| 1 | **nullifier** | Hash that identifies the spending of that note | Stored in `nullifiers`; cannot be used twice (prevents double spending). |
| 2 | **merkle_proof_length** | Length of the Merkle proof path | The circuit uses it to verify inclusion; the contract does not use it apart from passing it to the verifier. |
| 3 | **expected_merkle_root** | Root of the tree where the note is | The pool checks that it is in `isKnownRoot`; if not registered, it rejects. |
| 4 | **recipient** | Address that receives the USDC (as Field/bytes32) | The pool does `transfer(recipient, 1 USDC)`; this is who gets paid. |

The **order** must be exactly that: it is what the circuit defines and what `ShieldedPool.withdraw(proof, publicInputs)` uses.

### Where the 5 come from

- **You** (or your app) set them when generating the proof:
  - **value** = 1.
  - **nullifier** = derived from the note (e.g. Poseidon(random, pk_b)); you calculate it with the same data as the circuit.
  - **merkle_proof_length** = length of the path you use in the tree (e.g. 1 in the demo).
  - **expected_merkle_root** = root of the tree in which you prove your note exists (must be registered with `registerRoot`).
  - **recipient** = destination address in bytes32 format (20 bytes of address + padding).
- The **circuit** internally verifies that those values are consistent with the private inputs (pk_b, random, merkle path, etc.) and generates a **ZK proof** tied to those 5 public values.
- The **contract** receives the same 5 as `publicInputs` and:
  1. Checks `value == 1`, `isKnownRoot[root]`, `!nullifiers[nullifier]`.
  2. Calls `withdrawVerifier.verify(proof, publicInputs)`.
  3. If verification passes, marks the nullifier as spent and sends 1 USDC to `recipient`.

### The "5" detail in the verifier (20 vs 21)

The Honk verifier in Solidity does not work with just "5", but with a **total size** that includes the public inputs plus some internal protocol data (pairing):

- **In the circuit:** there are 5 public inputs.
- **In the verifier (Honk):** the verification key has a `publicInputsSize` field. In our code:
  - **20** = 4 "real" public inputs + 16 (pairing). Used by the **transfer** verifier.
  - **21** = 5 "real" public inputs + 16 (pairing). Used by the **withdraw** verifier.

That is why in `Verifier.sol`:

- `HonkVerificationKey` has `publicInputsSize: 20` → the transfer verifier expects **4** public inputs.
- `WithdrawVerificationKey` sets `publicInputsSize: 21` → the withdraw verifier expects **5** public inputs.

The constant `WITHDRAW_NUMBER_OF_PUBLIC_INPUTS = 5` is the one used in the `WithdrawVerifier` constructor so that the transcript and internal checks use "5" as the number of public inputs.

### Complete flow in a few lines

1. **Off-chain:** You have a note (value=1, pk_b, random, nullifier, and its commitment in a tree with root R). You build the 5 public inputs (value, nullifier, merkle_proof_length, R, recipient) and the private inputs (pk_b, random, Merkle path). You run the withdraw circuit prover → you get the **proof**.
2. **On-chain:** You call `pool.withdraw(proof, [value, nullifier, merkle_proof_length, expected_merkle_root, recipient])`.
3. **Contract:** Checks value, registered root, and unspent nullifier; calls `withdrawVerifier.verify(proof, publicInputs)`; if OK, marks nullifier and sends 1 USDC to `recipient`.

Thus, the **5 inputs** are the "agreement" between the circuit, the proof, and the contract: same 5, in the same order, so that the withdraw works and is verifiable on-chain.

---

## What stays private and what is public (deposit vs withdraw)

### Deposit

In the **deposit** there is no on-chain circuit: only a **commitment** (note hash) is sent. Everything that makes up the note stays in your client.

| Data | Public or private? | Where |
|------|---------------------|--------|
| **msg.sender** (who makes the deposit) | Public | On-chain in the tx |
| **commitment** | Public but opaque | On-chain; it is a hash, does not reveal the contents |
| **value** (1 USDC) | Private | Only in your app; part of the commitment |
| **pk_b** (note recipient, e.g. B=2, C=3) | Private | Only in your app; who can spend the note is not visible |
| **random** | Private | Only in your app; note randomness |
| **nullifier** (derived from random + pk_b) | Private | Only in your app; you will use it later in the withdraw |

Summary: **private** = value, pk_b, random, nullifier (the entire "note" except the commitment). **Public** = who deposits and the commitment (the commitment does not reveal who the note is for).

---

### Withdraw

In the **withdraw** the circuit has **public inputs** (the 5 that the contract receives) and **private inputs** (only enter the ZK proof, not on-chain).

| Data | Public or private? | Where |
|------|---------------------|--------|
| **value** | Public | Public input 0 |
| **nullifier** | Public | Public input 1 (to prevent double spending) |
| **merkle_proof_length** | Public | Public input 2 |
| **expected_merkle_root** | Public | Public input 3 |
| **recipient** | Public | Public input 4 (who receives the USDC) |
| **pk_b** (identity of the note owner) | Private | Only in the proof; not on-chain |
| **random** | Private | Only in the proof; not on-chain |
| **merkle_proof_indices** | Private | Only in the proof; path in the tree |
| **merkle_proof_siblings** | Private | Only in the proof; path in the tree |

Summary: **private** = pk_b, random, merkle_proof_indices, merkle_proof_siblings (who owned the note and how it sits in the tree). **Public** = the 5 inputs the contract receives; among them, the most important for privacy is that **recipient** is public (you can see who receives the USDC) and **who held the note** (pk_b) remains private.

---

## Can I withdraw with a "clean" wallet and keep the payment private?

Yes. The idea is:

1. **You have the note** (you know pk_b, random, the Merkle path, etc.) and generate the proof off-chain.
2. **You send the withdraw tx** from a **wallet with no history linked to you** (new or dedicated wallet). That wallet is the **msg.sender** of the tx; on-chain you can only see "this address sent a withdraw tx".
3. You set as **recipient** (who receives the 1 USDC) whatever address you want: it can be that same clean wallet, another new one, or an exchange, etc.

**What an on-chain observer sees:**
"Address X (msg.sender) called `withdraw` and 1 USDC went to address Y (recipient)."
**What they don't see:**
Who owned the note (pk_b), which deposit it came from, or any connection to your "real" identity. There is no on-chain link between the original deposit and this withdraw.

**Nuances:**

- **recipient is public.** If you withdraw to an address associated with you (your main wallet, a CEX with KYC), it will be visible that this address received 1 USDC; what is not visible is who held the note. For more privacy, withdraw to an address not linked to you.
- **msg.sender (who sends the tx)** is also public. If you use a clean wallet only to send this tx, that wallet becomes "associated" with this withdraw. If you want further decoupling, you can use a **relayer**: another person or service that sends the tx for you (they are msg.sender) and the **recipient** is your wallet; this way who gets paid is not who signs the tx.

In summary: **yes, you can go to the pool and withdraw with the note using a wallet with no history linked to you, and the payment remains private** in the sense that the withdrawal cannot be linked to the deposit or to the note owner; you just need to be careful about which address you set as recipient and, if you want additional layers, use a relayer so that who signs the tx is not who receives the USDC.

The **WithdrawVerifier** is now deployed with the correct verification key for **5 public inputs** on both Monad and Celo. The following describes the architecture for reference.

### 1. Real withdraw verification key (5 public inputs)

- Compile the **withdraw circuit** with the backend that generates the Honk verifier:
  ```bash
  cd circuits && ./scripts/compile_withdraw_verifier.sh
  ```
- In the generated `Verifier.sol` (or in `WithdrawVerifier.sol`) there will be a **verification key** different from the transfer's (with `publicInputsSize` = 21, i.e. 5 + 16 pairing points).
- **Integrate that key into `Verifier.sol`:**
  - Add a constant for withdraw, e.g. `WITHDRAW_NUMBER_OF_PUBLIC_INPUTS = 5` (or 21 if the backend uses the total).
  - Create a **WithdrawVerificationKey** library that loads the key generated for the withdraw circuit (copying the values from the `Verifier.sol` output of compiling withdraw).
  - Make the **WithdrawVerifier** contract inherit from `BaseZKHonkVerifier(N, LOG_N, 5)` (or the value the base uses) and in `loadVerificationKey()` return `WithdrawVerificationKey.loadVerificationKey()` instead of `HonkVerificationKey.loadVerificationKey()`.
- Redeploy the pool (or only the WithdrawVerifier if the pool already points to an address you will replace).

### 2. Proof in Honk format

- The proof must be the one produced by the **Honk prover** for the withdraw circuit (same backend as the verifier).
- Format expected by the contract: **507 field elements** of 32 bytes each (same layout as the transfer verifier).
- If your proof pipeline generates the proof in a different format, a conversion step is needed to convert it to the Honk format expected by the Solidity verifier.

### 3. On-chain conditions (already covered if you followed the steps)

- **Registered root:** the `expected_merkle_root` used by the proof must be registered in the pool (`registerRoot`), as you already did with `register_root.mjs`.
- **WithdrawVerifier deployed:** the pool must have `withdrawVerifier != address(0)` configured (already done in your deploy).
- **Unspent nullifier:** the note's nullifier cannot have been used before in another withdraw.
- **USDC in the pool:** the pool must have at least 1 USDC (e.g. from a previous deposit).

### Summary

| Requirement | Typical status |
|-----------|----------------|
| Withdraw verification key (5 inputs) in Verifier.sol | Done: WithdrawVerifier deployed on Monad and Celo |
| Honk proof from the withdraw circuit | Done: `prove_withdraw.sh` generates valid proofs |
| Registered root | Done with `register_root.mjs` (or auto-registered by frontend on first claim) |
| WithdrawVerifier deployed | Done: Monad `0x4d900D53514140755fe842eb3e0d53b12BBcCD24`, Celo `0xfe231dd394Df5863B02BfA9CFA50f4877961d5b7` |
| Pool with USDC | After at least one deposit |

With the deployed WithdrawVerifier and a valid Honk proof, `withdraw_one.mjs` calls `pool.withdraw(proof, publicInputs)` and the tx completes successfully.

---

## Environment variables

In `.env` or exported:

```bash
export MONAD_RPC="https://rpc3.monad.xyz"
export PRIVATE_KEY="0x..."
export POOL_ADDRESS="0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c"   # ShieldedPool on Monad Mainnet
export USDC_ADDRESS="0x754704Bc059F8C67012fEd69BC8A327a5aafb603"  # USDC on Monad (6 decimals)
```

---

## 1. Testing Deposit

### What is anonymous in deposit

- **Visible on-chain:** `msg.sender` (who sends the 1 USDC and calls `deposit`).
- **Private (only in the note):** the **note recipient** (pk_b). Who can spend that note later is not visible on chain; only the commitment.

### Steps

1. Make sure you have at least 1 USDC in the wallet that uses `PRIVATE_KEY`.

2. A single deposit (payment A→B for index 0):

   ```bash
   PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs
   ```

   For more demo deposits (A→B, A→C, ...):

   ```bash
   PAYMENT_INDEX=1 node circuits/scripts/deposit_one.mjs   # A→C
   PAYMENT_INDEX=2 node circuits/scripts/deposit_one.mjs   # A→B
   # ...
   ```

3. Verify on-chain:
   - In the explorer: the `deposit` tx shows your address as `from`.
   - The commitment is an opaque `bytes32`; it does not reveal the note recipient (B/C).

With this you validate: **deposit works and the note owner (recipient) remains anonymous.**

---

## 2. Testing Withdraw

### What is anonymous in withdraw

- **Visible on-chain:** the **recipient** (address that receives the 1 USDC) and the **nullifier** (to prevent double spending).
- **Private:** **who held the note** (who knows pk_b/random and generated the proof). The ZK proof demonstrates "I have a valid note" without revealing which note or which identity.

### Prerequisites

- Pool deployed **with** `WithdrawVerifier` (as in your deploy).
- The **root** used by the withdraw circuit must be registered in the pool (see step 2.1).
- Proof from the withdraw circuit in Honk format (same as the on-chain verifier).

**Note:** The `WithdrawVerifier` is deployed with the correct verification key for 5 public inputs on both Monad and Celo. The following steps work end-to-end.

### 2.1 Register the root

The withdraw proves inclusion in a Merkle tree; the root must be registered:

```bash
node circuits/scripts/register_root.mjs
```

Uses by default the `expected_merkle_root` from `circuits/WithdrawProver.toml`. If you use a different root, pass it with `ROOT=0x... node circuits/scripts/register_root.mjs`.

### 2.2 How to generate a Honk proof for the withdraw circuit

The on-chain verifier expects a proof in **Barretenberg/Honk format**: the same format generated by the `bb` (Barretenberg CLI) tool.

**Script that automates the steps:** from `circuits/` you can run `./scripts/prove_withdraw.sh`. Requires `nargo` and `bb` installed. If the witness or artifact has a different name in your installation, edit the paths in the script. If everything goes well, the hex proof ends up in `circuits/proofs/withdraw.proof`.

**Manual steps (in case the script fails or you want to customize):**

#### Requirements

- **Noir:** `nargo` installed (`noirup`).
- **Barretenberg:** `bb` CLI installed (`bbup`, see [README](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/bbup)).
- In `circuits/`, the **withdraw** circuit must be compiled as the main program (same as for the verifier).

#### Steps (summary)

1. **Compile the withdraw circuit** (same as for the verifier):
   ```bash
   cd circuits && ./scripts/compile_withdraw_verifier.sh
   ```
   This leaves the artifact in `target/` (e.g. `with_foundry.json`) and restores `main.nr`. For testing you need the withdraw circuit as main again.

2. **Set withdraw as main and generate witness:**
   ```bash
   cd circuits
   cp src/main.nr src/main.nr.bak
   cp src/withdraw.nr src/main.nr
   nargo compile
   nargo execute -p WithdrawProver
   ```
   `WithdrawProver.toml` must have the 5 public inputs and the private ones (pk_b, random, merkle path). The witness is written to `target/` (name according to your Nargo.toml, e.g. associated with `WithdrawProver`).

3. **Generate the proof with Barretenberg:**
   ```bash
   bb prove -b ./target/with_foundry.json -w ./target/WithdrawProver -o ./target --oracle_hash keccak
   ```
   (Adjust `-w` if the witness has a different name/path; in some setups the artifact or witness has a different name.)

   `bb` writes to `-o` (e.g. `./target`) two files in **binary**: `proof` and `public_inputs`. The proof is 507 field elements x 32 bytes = 16,224 bytes.

4. **Convert the proof to hex** for `withdraw_one.mjs` (which expects a file with the proof in hex, like `0x...`):
   ```bash
   # From circuits/
   node -e "
   const fs = require('fs');
   const p = fs.readFileSync('./target/proof');
   fs.mkdirSync('./proofs', { recursive: true });
   fs.writeFileSync('./proofs/withdraw.proof', '0x' + p.toString('hex'));
   console.log('Proof hex written to proofs/withdraw.proof,', p.length, 'bytes');
   "
   ```

5. **Call withdraw on-chain:**
   ```bash
   PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
   ```
   (Or from the repo root, with `PROOF_FILE` pointing to that file.)

If in your installation the artifact or witness name is different (e.g. a name other than `with_foundry` or `WithdrawProver`), change `-b` and `-w` according to what `nargo compile` and `nargo execute` generate. The Solidity verifier you have is Honk; if you use a different version of `bb` that generates a different format, you may need to use the exact variant that generated that contract (e.g. `bb prove_ultra_honk` if applicable).

### 2.3 Call withdraw on-chain

With proof and public inputs ready:

```bash
# Proof in hex (0x + 64*507 characters)
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

Or passing the 5 public inputs manually (order: value, nullifier, merkle_proof_length, expected_merkle_root, recipient):

```bash
WITHDRAW_VALUE=0x1 \
NULLIFIER=0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400 \
MERKLE_PROOF_LENGTH=1 \
EXPECTED_ROOT=0x1364dee863ea150a4774ed9bc287bd4a4b7bec30e86f6bc29decf65a3b3bc4aa \
RECIPIENT=0x0000000000000000000000001234567890123456789012345678901234567890 \
PROOF_FILE=circuits/proofs/withdraw.proof \
node circuits/scripts/withdraw_one.mjs
```

`RECIPIENT` is the address as bytes32 (20 bytes of address + padding to 32).

When the withdraw verifier accepts 5 public inputs, this call will send 1 USDC to `recipient` and mark the nullifier as spent.

---

## Anonymity summary

| Action   | Visible on-chain                         | Private / anonymous                          |
|----------|------------------------------------------|--------------------------------------------|
| Deposit  | Who deposits (msg.sender)              | Note recipient (who can spend) |
| Withdraw | Which address receives (recipient), nullifier | Who held the note (who generated the proof)   |

This validates that deposit and withdraw work and which part of the flow remains anonymous.
