"use client";

import type { Hex } from "viem";

// ── Types ───────────────────────────────────────────────

export interface NoteData {
  value: bigint;
  holder: bigint; // pk_b (recipient public key as Field)
  random: bigint;
  nullifier: bigint; // nullifier_out = poseidon2(random, pk_b)
  commitment: bigint; // full commitment
}

export interface ProofInput {
  new_commitment: string;
  nullifier_in: string;
  merkle_proof_length: string;
  expected_merkle_root: string;
  value: string;
  pk_b: string;
  random: string;
  from: string;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
}

export interface ProofResult {
  proof: Hex;
  publicInputs: {
    newCommitment: Hex;
    nullifierIn: Hex;
    merkleProofLength: number;
    expectedRoot: Hex;
  };
}

// ── Lazy WASM initialization ────────────────────────────
// Barretenberg is heavy (~30MB WASM). Lazy-load and cache as singleton.

let bbInstance: any = null;
let FrClass: any = null;

async function getBb() {
  if (bbInstance) return { bb: bbInstance, Fr: FrClass };

  const { Barretenberg, Fr } = await import("@aztec/bb.js");
  bbInstance = await Barretenberg.new();
  FrClass = Fr;

  return { bb: bbInstance, Fr: FrClass };
}

// ── Poseidon2 hash (matches circuit) ────────────────────

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const { bb, Fr } = await getBb();
  const result = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
  return BigInt(result.toString());
}

// ── Commitment computation (matches main.nr) ───────────
// compute_entry(value, holder, random, nullifier) =
//   poseidon2(poseidon2(value, holder), poseidon2(random, nullifier))

export async function computeEntry(
  value: bigint,
  holder: bigint,
  random: bigint,
  nullifier: bigint
): Promise<bigint> {
  const left = await poseidon2(value, holder);
  const right = await poseidon2(random, nullifier);
  return poseidon2(left, right);
}

// ── Note creation ───────────────────────────────────────

export async function createNote(
  value: bigint,
  recipientPk: bigint,
  randomness: bigint
): Promise<NoteData> {
  const nullifier = await poseidon2(randomness, recipientPk);
  const commitment = await computeEntry(
    value,
    recipientPk,
    randomness,
    nullifier
  );

  return {
    value,
    holder: recipientPk,
    random: randomness,
    nullifier,
    commitment,
  };
}

// ── Hex conversion helpers ──────────────────────────────

export function bigintToBytes32(x: bigint): Hex {
  return `0x${x.toString(16).padStart(64, "0")}` as Hex;
}

export function fieldToHex(x: bigint): string {
  return `0x${x.toString(16).padStart(64, "0")}`;
}

// ── Derive pk_b from Ethereum address ───────────────────

export function addressToFieldPk(address: string): bigint {
  return BigInt(address);
}

// ── Secure randomness ───────────────────────────────────

export function generateRandomField(): bigint {
  const bytes = new Uint8Array(31); // 31 bytes to stay under BN254 field
  crypto.getRandomValues(bytes);
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) + BigInt(b);
  }
  return result;
}

// ── Proof generation ────────────────────────────────────
// This is SLOW (~10-30 seconds). Always show a loading state.

export async function generateProof(
  input: ProofInput
): Promise<ProofResult> {
  const [{ Noir }, { UltraHonkBackend, Barretenberg }] = await Promise.all([
    import("@noir-lang/noir_js"),
    import("@aztec/bb.js"),
  ]);

  // Fetch circuit artifact from public directory
  const circuitResponse = await fetch("/circuits/circuit.json");
  const circuit = await circuitResponse.json();

  // Create instances
  const bb = await Barretenberg.new();
  const backend = new UltraHonkBackend(circuit.bytecode, bb);
  const noir = new Noir(circuit);

  // Generate witness then proof
  const { witness } = await noir.execute(input);
  const proof = await backend.generateProof(witness);

  // Clean up
  await bb.destroy();

  // Convert proof to hex
  const proofHex = `0x${Array.from(new Uint8Array(proof.proof))
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;

  return {
    proof: proofHex,
    publicInputs: {
      newCommitment: bigintToBytes32(BigInt(input.new_commitment)),
      nullifierIn: bigintToBytes32(BigInt(input.nullifier_in)),
      merkleProofLength: Number(input.merkle_proof_length),
      expectedRoot: bigintToBytes32(BigInt(input.expected_merkle_root)),
    },
  };
}
