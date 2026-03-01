#!/usr/bin/env node
/**
 * Prepares the data for withdrawing the 2 notes created with
 * PAYMENT_INDEX=0 and PAYMENT_INDEX=1 (two consecutive deposits).
 *
 * Usage: node scripts/prepare_withdraw_two_notes.mjs
 *
 * Output: prints the values for WithdrawProver.toml of each note
 *         and the root R2 (tree with 2 leaves) in case it is not yet registered.
 *
 * Requires: @aztec/bb.js (npm install in circuits/ or repo)
 */

import { Barretenberg, Fr } from "@aztec/bb.js";

const B = 2n;
const C = 3n;
const RECIPIENTS = [B, C]; // index 0 -> B, index 1 -> C

function toBigInt(frOrBytes) {
  if (typeof frOrBytes === "bigint") return frOrBytes;
  if (frOrBytes instanceof Fr) return BigInt(frOrBytes.toString());
  throw new Error("Unexpected type");
}

function toHex64(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}

async function main() {
  const bb = await Barretenberg.new();
  const poseidon2 = async (a, b) => {
    const out = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
    return toBigInt(out);
  };
  const computeEntry = async (value, holder, random, nullifier) => {
    const a = await poseidon2(value, holder);
    const b = await poseidon2(random, nullifier);
    return await poseidon2(a, b);
  };

  // Note 0: PAYMENT_INDEX=0 -> pk_b=2, random=100
  const pk_b0 = B;
  const random0 = 100n;
  const nullifier0 = await poseidon2(random0, pk_b0);
  const commitment0 = await computeEntry(1n, pk_b0, random0, nullifier0);

  // Note 1: PAYMENT_INDEX=1 -> pk_b=3, random=101
  const pk_b1 = C;
  const random1 = 101n;
  const nullifier1 = await poseidon2(random1, pk_b1);
  const commitment1 = await computeEntry(1n, pk_b1, random1, nullifier1);

  // Tree with 2 leaves: root = H(C0, C1). Convention: index 0 = left, 1 = right.
  const root2 = await poseidon2(commitment0, commitment1);

  await bb.destroy();

  const recipientPlaceholder = "0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d";

  console.log("=== Root of the tree with 2 deposits (register if not already done) ===");
  console.log("expected_merkle_root (R2):", toHex64(root2));
  console.log("");

  console.log("=== Note 0 (first deposit, PAYMENT_INDEX=0) → pk_b=2, random=100 ===");
  console.log(`
# WithdrawProver.toml for NOTE 0 (save as WithdrawProver_note0.toml or replace and generate proof)
value = "0x1"
nullifier = "${toHex64(nullifier0)}"
merkle_proof_length = 1
expected_merkle_root = "${toHex64(root2)}"
recipient = "${recipientPlaceholder}"

pk_b = "0x2"
random = "0x64"
merkle_proof_indices = [0,0,0,0,0,0,0,0,0,0]
merkle_proof_siblings = ["${toHex64(commitment1)}","0x0","0x0","0x0","0x0","0x0","0x0","0x0","0x0","0x0"]
`);
  console.log("---");
  console.log("=== Note 1 (second deposit, PAYMENT_INDEX=1) → pk_b=3, random=101 ===");
  console.log(`
# WithdrawProver.toml for NOTE 1 (save as WithdrawProver_note1.toml or replace and generate proof)
value = "0x1"
nullifier = "${toHex64(nullifier1)}"
merkle_proof_length = 1
expected_merkle_root = "${toHex64(root2)}"
recipient = "${recipientPlaceholder}"

pk_b = "0x3"
random = "0x65"
merkle_proof_indices = [1,0,0,0,0,0,0,0,0,0]
merkle_proof_siblings = ["${toHex64(commitment0)}","0x0","0x0","0x0","0x0","0x0","0x0","0x0","0x0","0x0"]
`);

  console.log("=== How to use ===");
  console.log("1. Register R2 if missing: ROOT=" + toHex64(root2) + " node scripts/register_root.mjs");
  console.log("2. Note 0: copy the 'Note 0' block to WithdrawProver.toml → ./scripts/prove_withdraw.sh → PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs");
  console.log("3. Note 1: copy the 'Note 1' block to WithdrawProver.toml → ./scripts/prove_withdraw.sh → PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
