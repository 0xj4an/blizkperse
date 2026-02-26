#!/usr/bin/env node
/**
 * Prepara los datos para hacer withdraw de las 2 notas creadas con
 * PAYMENT_INDEX=0 y PAYMENT_INDEX=1 (dos depósitos seguidos).
 *
 * Uso: node scripts/prepare_withdraw_two_notes.mjs
 *
 * Salida: imprime los valores para WithdrawProver.toml de cada nota
 *         y el root R2 (tree con 2 hojas) por si aún no está registrado.
 *
 * Requiere: @aztec/bb.js (npm install en circuits/ o repo)
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

  // Nota 0: PAYMENT_INDEX=0 -> pk_b=2, random=100
  const pk_b0 = B;
  const random0 = 100n;
  const nullifier0 = await poseidon2(random0, pk_b0);
  const commitment0 = await computeEntry(1n, pk_b0, random0, nullifier0);

  // Nota 1: PAYMENT_INDEX=1 -> pk_b=3, random=101
  const pk_b1 = C;
  const random1 = 101n;
  const nullifier1 = await poseidon2(random1, pk_b1);
  const commitment1 = await computeEntry(1n, pk_b1, random1, nullifier1);

  // Árbol con 2 hojas: root = H(C0, C1). Convención: índice 0 = izquierda, 1 = derecha.
  const root2 = await poseidon2(commitment0, commitment1);

  await bb.destroy();

  const recipientPlaceholder = "0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d";

  console.log("=== Root del árbol con 2 depósitos (registrar si aún no está) ===");
  console.log("expected_merkle_root (R2):", toHex64(root2));
  console.log("");

  console.log("=== Nota 0 (primer depósito, PAYMENT_INDEX=0) → pk_b=2, random=100 ===");
  console.log(`
# WithdrawProver.toml para NOTA 0 (guárdalo como WithdrawProver_note0.toml o reemplaza y genera proof)
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
  console.log("=== Nota 1 (segundo depósito, PAYMENT_INDEX=1) → pk_b=3, random=101 ===");
  console.log(`
# WithdrawProver.toml para NOTA 1 (guárdalo como WithdrawProver_note1.toml o reemplaza y genera proof)
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

  console.log("=== Cómo usar ===");
  console.log("1. Registrar R2 si falta: ROOT=" + toHex64(root2) + " node scripts/register_root.mjs");
  console.log("2. Nota 0: copia el bloque 'Nota 0' a WithdrawProver.toml → ./scripts/prove_withdraw.sh → PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs");
  console.log("3. Nota 1: copia el bloque 'Nota 1' a WithdrawProver.toml → ./scripts/prove_withdraw.sh → PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
