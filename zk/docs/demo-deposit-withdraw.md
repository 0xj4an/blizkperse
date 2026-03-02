# Demo: Deposit (wallet A) and Withdraw (wallet B)

List of steps and commands to compile circuits, deploy contracts, and run a demo: **wallet A** deposits 1 USDC (creating a note for B); **wallet B** withdraws that 1 USDC to its address.

---

## Prerequisites

- **Node.js** (for the `.mjs` scripts)
- **Forge** (Foundry)
- **Nargo** (Noir), e.g. `noirup`
- **Barretenberg** (`bb`), e.g. via [bbup](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/bbup)
- **Wallet A:** with USDC and MON (gas) on Monad
- **Wallet B:** with MON (gas); does not need USDC (will receive 1 USDC on withdraw)

---

## 1. Environment variables

Create or edit `.env` in the repo root:

```bash
# Deploy (Forge)
PRIVATE_KEY=          # Deployer key (e.g. wallet A's key for simplicity)
USDC_ADDRESS=0x754704Bc059F8C67012fEd69BC8A327a5aafb603  # Monad USDC (6 decimals)
MONAD_RPC=https://rpc3.monad.xyz

# After deploy, fill in the new pool
POOL_ADDRESS=         # Filled in after step 3
```

For the demo we will use:
- **Wallet A:** the one with USDC; it will make the deposit (can be the same as the deploy `PRIVATE_KEY`).
- **Wallet B:** the one that will make the withdraw (must be the "owner" of the note: in the demo, the note is created for B with `pk_b=2`; B knows the note data and generates the proof).

---

## 2. Compile circuits

From the **repo root** (or `circuits/` as indicated by each command).

### 2.1 Main circuit (transfer)

The transfer verifier is already in `contract/Verifier.sol`. If you changed `main.nr`, compile:

```bash
cd circuits
nargo compile
cd ..
```

### 2.2 Withdraw circuit (verifier already integrated)

The withdraw verifier is integrated in `contract/Verifier.sol`. You only need to compile the withdraw circuit if you are going to **generate a proof** later:

```bash
cd circuits
./scripts/compile_withdraw_verifier.sh
cd ..
```

(If you are only doing deposit and not withdraw in this demo, you can skip this until step 6.)

---

## 3. Deploy contracts

From the **repo root**:

```bash
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

Note the **ShieldedPool** address printed by the script (or in `broadcast/.../run-latest.json`). This is the one you will use as `POOL_ADDRESS`.

---

## 4. Configure POOL_ADDRESS

In your `.env` (or by exporting in the session):

```bash
export POOL_ADDRESS=0x...   # The pool address from step 3
```

Or edit `.env` and set `POOL_ADDRESS=0x...`.

---

## 5. Register the withdraw root

The withdraw requires that `expected_merkle_root` is registered in the pool. The scripts use the root from `circuits/WithdrawProver.toml` by default.

From the **repo root** (with `MONAD_RPC`, `PRIVATE_KEY`, `POOL_ADDRESS` in the environment):

```bash
source .env
node scripts/register_root.mjs
```

It should print something like `Root registered ✅`.

---

## 6. Demo -- Deposit with wallet A

**Wallet A** deposits 1 USDC and creates a note whose "owner" is B (in the demo, `pk_b=2` for the first payment).

Configure the session with **A**'s key and the pool:

```bash
source .env
export PRIVATE_KEY=0x...    # Wallet A's private key (with USDC)
export POOL_ADDRESS=0x...   # The deployed pool
```

A single deposit (note for B, index 0):

```bash
PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs
```

You should see something like: `Payment 1 (A→B), commitment: 0x...` and `deposit done ✅`.

Verify in the explorer that the `deposit` tx is signed by wallet A and that the pool has 1 more USDC.

---

## 7. Demo -- Withdraw with wallet B

**Wallet B** is the owner of the note (pk_b=2, random=100 for PAYMENT_INDEX=0). B generates the proof and sends the withdraw tx; the 1 USDC goes to the address set as `recipient` (e.g. B itself).

### 7.1 Generate the Honk proof (with B's note data)

The default values in `WithdrawProver.toml` correspond to that note (pk_b=2, random=100). From `circuits/`:

```bash
cd circuits
./scripts/prove_withdraw.sh
cd ..
```

Requirements: `nargo` and `bb` installed. The script outputs the hex proof at `circuits/proofs/withdraw.proof`.

If you want the **recipient** to be wallet B, edit `circuits/WithdrawProver.toml` and set `recipient` to B's address in bytes32 format (0x + 40 hex characters of the address padded to 64 characters), for example:

```toml
recipient = "0x000000000000000000000000<20_bytes_of_wallet_B>"
```

Run `./scripts/prove_withdraw.sh` again after changing `recipient`.

### 7.2 Send the withdraw with wallet B

Configure the session with **B**'s key (and the same pool). The script uses **B_PRIVATE_KEY** if defined; otherwise it uses PRIVATE_KEY:

```bash
source .env
export B_PRIVATE_KEY=0x...  # Wallet B's private key
export POOL_ADDRESS=0x...   # The same pool
```

Run the withdraw script (from the repo root):

```bash
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

It should print `withdraw tx: 0x...` and `Withdraw done ✅`. The pool sends 1 USDC to the `recipient` configured in the proof (e.g. wallet B).

---

## Command summary (copy-paste)

Assuming you already have `.env` with `MONAD_RPC`, `USDC_ADDRESS`, `PRIVATE_KEY` (deployer), and that after deploy you save the pool in `POOL_ADDRESS`:

```bash
# 1) Compile withdraw circuit (to be able to generate proof)
cd circuits && ./scripts/compile_withdraw_verifier.sh && cd ..

# 2) Deploy
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
# Note the POOL_ADDRESS and add it to .env

# 3) Register root
export POOL_ADDRESS=0x...   # the new pool
node scripts/register_root.mjs

# 4) Deposit with wallet A
export PRIVATE_KEY=0x...    # A's key (with USDC)
PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs

# 5) Generate proof (recipient in WithdrawProver.toml = B if you want B to receive)
cd circuits && ./scripts/prove_withdraw.sh && cd ..

# 6) Withdraw with wallet B
export B_PRIVATE_KEY=0x...  # B's key (the script uses B_PRIVATE_KEY or PRIVATE_KEY)
PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
```

---

## Withdraw of 2 deposits (after registering a second root)

If you did: **registerRoot(R1) → deposit → deposit → registerRoot(R2)** (two roots registered, R2 = tree with 2 leaves), to withdraw **each** of the 2 notes you must use **root R2** as `expected_merkle_root` and the correct **Merkle path** for each note.

- **Note 0** (first deposit, `PAYMENT_INDEX=0`): pk_b=2, random=100. In the 2-leaf tree, leaf 0 has sibling leaf 1; index = 0 (left).
- **Note 1** (second deposit, `PAYMENT_INDEX=1`): pk_b=3, random=101. Leaf 1 has sibling leaf 0; index = 1 (right).

### Script that prepares the data

From `zk/circuits/`:

```bash
cd zk/circuits
node scripts/prepare_withdraw_two_notes.mjs
```

The script prints the **root R2** and two **WithdrawProver.toml** blocks (one for note 0 and one for note 1) with nullifier, `expected_merkle_root = R2`, `merkle_proof_length = 1`, and correct indices/siblings.

### Steps to withdraw the 2 notes

1. **Register R2** if not already done: `ROOT=<R2> node zk/scripts/register_root.mjs`
2. **Withdraw note 0**: paste the "Note 0" block into `WithdrawProver.toml` → `./scripts/prove_withdraw.sh` → `PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs` (with `B_PRIVATE_KEY`).
3. **Withdraw note 1**: paste the "Note 1" block into `WithdrawProver.toml` → same flow (prove_withdraw.sh + withdraw_one.mjs). Use the key of note 1's owner (C if it was A→C).

Each withdraw spends a different nullifier.

### Retrieve commitments and root from chain

If you don't know what data a root was registered with, you can reconstruct the tree from on-chain **Deposit** events and recalculate the root:

```bash
cd zk/circuits
MONAD_RPC=https://rpc3.monad.xyz node scripts/commitments_and_root_from_chain.mjs
```

Optional: `FROM_BLOCK`, `TO_BLOCK`, `POOL_ADDRESS`. The script prints: (1) list of commitments in chronological order, (2) the calculated Merkle root (Poseidon2, depth 10), (3) for each leaf the path (indices + siblings) to use in `WithdrawProver.toml`. If the printed root matches one already registered, you can use that root and the path of the leaf that is your note (you also need the nullifier/pk_b/random of that note).

---

## Notes

- **A** and **B** can be the same wallet for testing; for the "deposit with A, withdraw with B" demo you use two different keys.
- The withdraw **recipient** is public on-chain; **who held the note** (B in this case) remains hidden behind the ZK proof.
- If `prove_withdraw.sh` fails due to the witness path, check the output of `nargo execute -p WithdrawProver` and adjust `WITNESS_PATH` inside the script.
