import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;
import { generateWithdrawProof } from "../../lib/withdrawProver";

// Simple in-memory lock to prevent concurrent proof generation
// (since we use the same Prover.toml file)
let isGenerating = false;
const queue: Array<() => void> = [];

async function acquireLock(): Promise<void> {
  if (!isGenerating) {
    isGenerating = true;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
}

function releaseLock(): void {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    isGenerating = false;
  }
}

export async function POST(req: NextRequest) {
  await acquireLock();
  try {
    const input = await req.json();

    // Validate inputs
    const required = ["value", "nullifier", "merkle_proof_length", "expected_merkle_root", "recipient", "pk_b", "random", "merkle_proof_indices", "merkle_proof_siblings"];
    for (const field of required) {
      if (!(field in input)) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
      }
    }

    const MAX_DEPTH = 10;
    const rawLength = input.merkle_proof_length;
    const merkleProofLength = typeof rawLength === "string" ? parseInt(rawLength, 10) : Number(rawLength);
    if (Number.isNaN(merkleProofLength) || merkleProofLength < 0 || merkleProofLength > MAX_DEPTH) {
      return NextResponse.json(
        { error: `merkle_proof_length must be a number between 0 and ${MAX_DEPTH}, got: ${rawLength}` },
        { status: 400 }
      );
    }
    const indices = Array.isArray(input.merkle_proof_indices) ? input.merkle_proof_indices : [];
    const siblings = Array.isArray(input.merkle_proof_siblings) ? input.merkle_proof_siblings : [];
    if (indices.length !== MAX_DEPTH || siblings.length !== MAX_DEPTH) {
      return NextResponse.json(
        { error: `merkle_proof_indices and merkle_proof_siblings must have exactly ${MAX_DEPTH} elements, got ${indices.length} and ${siblings.length}` },
        { status: 400 }
      );
    }

    const normalizedInputs = {
      value: String(input.value),
      nullifier: String(input.nullifier),
      merkle_proof_length: merkleProofLength,
      expected_merkle_root: String(input.expected_merkle_root),
      recipient: String(input.recipient),
      pk_b: String(input.pk_b),
      random: String(input.random),
      merkle_proof_indices: indices.map((i: number) => Number(i)),
      merkle_proof_siblings: siblings.map((s: string) => String(s).trim()),
    };

    const { proofHex } = await generateWithdrawProof(normalizedInputs);

    return NextResponse.json({
      proof: proofHex,
    });
  } catch (error) {
    console.error("Proof generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Proof generation failed: ${message}` }, { status: 500 });
  } finally {
    releaseLock();
  }
}
