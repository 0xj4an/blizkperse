"use client";

import type { Hex } from "viem";
import { poseidon2 as poseidonHash } from "@/lib/poseidon2-hash";

// ── Types ───────────────────────────────────────────────

export interface NoteData {
  value: bigint;
  holder: bigint; // pk_b (recipient public key as Field)
  random: bigint;
  nullifier: bigint; // nullifier_out = poseidon2(random, pk_b)
  commitment: bigint; // full commitment
}

export interface ProofInput {
  // Public inputs (must match withdraw circuit order)
  value: string;
  nullifier: string;
  merkle_proof_length: string;
  expected_merkle_root: string;
  recipient: string;
  // Private inputs
  pk_b: string;
  random: string;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
}

export interface ProofResult {
  proof: Hex;
  publicInputs: {
    value: Hex;
    nullifier: Hex;
    merkleProofLength: number;
    expectedRoot: Hex;
    recipient: Hex;
  };
}

// ── Poseidon hash (matches circuit's poseidon::poseidon::bn254::hash_2) ──
// Vendored via @/lib/poseidon2-hash (in-repo), not the npm package async chunk.

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  return poseidonHash([a, b]);
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
// Uses server-side nargo prove for compatibility with deployed verifier.

export async function generateProof(
  input: ProofInput
): Promise<ProofResult> {
  // Call server-side proof generation API
  const response = await fetch("/api/generate-proof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Proof generation failed: ${response.status}`);
  }

  const { proof } = await response.json();

  return {
    proof: proof as Hex,
    publicInputs: {
      value: bigintToBytes32(BigInt(input.value)),
      nullifier: bigintToBytes32(BigInt(input.nullifier)),
      merkleProofLength: Number(input.merkle_proof_length),
      expectedRoot: bigintToBytes32(BigInt(input.expected_merkle_root)),
      recipient: bigintToBytes32(BigInt(input.recipient)),
    },
  };
}

export type DepositProofInput = {
  value: string;
  commitment: string;
  pk_b: string;
  random: string;
  nullifier: string;
};

/** Client timeout for /api/generate-deposit-proof (WASM prove is ~1–2s once warm). */
const DEPOSIT_PROOF_TIMEOUT_MS = 90_000;

export async function generateDepositProof(input: DepositProofInput): Promise<{
  proof: Hex;
  publicInputs: Hex[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEPOSIT_PROOF_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/generate-deposit-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Deposit proof timed out after ${DEPOSIT_PROOF_TIMEOUT_MS / 1000}s. The prover may be stuck — restart the Next.js server (npx next dev --webpack) and retry.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Deposit proof generation failed: ${response.status}`);
  }

  const { proof, publicInputs } = await response.json();
  if (typeof proof !== "string" || !proof.startsWith("0x")) {
    throw new Error("Deposit proof API returned a malformed proof");
  }
  // DepositVerifier.sol calculateProofSize(LOG_N=12) === 7232 bytes
  const proofByteLen = (proof.length - 2) / 2;
  if (proofByteLen !== 7232) {
    throw new Error(
      `Deposit proof length ${proofByteLen} != 7232 expected by deployed DepositVerifier. Do not submit; regenerate or fix deposit circuit artifact.`,
    );
  }
  return {
    proof: proof as Hex,
    publicInputs: (publicInputs as string[]).map((x) => bigintToBytes32(BigInt(x))) as Hex[],
  };
}
