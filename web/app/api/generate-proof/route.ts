import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;
import { generateWithdrawProof } from "../../lib/withdrawProver";
import { generateWithdrawDenomProof } from "../../lib/withdrawDenomProver";

// Simple in-memory lock to prevent concurrent proof generation
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

const MAX_DEPTH = 10;

function validateMerkle(input: Record<string, unknown>): {
  merkleProofLength: number;
  indices: number[];
  siblings: string[];
} | { error: string } {
  const rawLength = input.merkle_proof_length;
  const merkleProofLength =
    typeof rawLength === "string" ? parseInt(rawLength, 10) : Number(rawLength);
  if (
    Number.isNaN(merkleProofLength) ||
    merkleProofLength < 0 ||
    merkleProofLength > MAX_DEPTH
  ) {
    return {
      error: `merkle_proof_length must be a number between 0 and ${MAX_DEPTH}, got: ${rawLength}`,
    };
  }
  const indices = Array.isArray(input.merkle_proof_indices)
    ? input.merkle_proof_indices
    : [];
  const siblings = Array.isArray(input.merkle_proof_siblings)
    ? input.merkle_proof_siblings
    : [];
  if (indices.length !== MAX_DEPTH || siblings.length !== MAX_DEPTH) {
    return {
      error: `merkle_proof_indices and merkle_proof_siblings must have exactly ${MAX_DEPTH} elements, got ${indices.length} and ${siblings.length}`,
    };
  }
  return {
    merkleProofLength,
    indices: indices.map((i: number) => Number(i)),
    siblings: siblings.map((s: string) => String(s).trim()),
  };
}

export async function POST(req: NextRequest) {
  await acquireLock();
  try {
    const input = await req.json();
    const mode =
      input.mode === "private" || input.denomination_id !== undefined
        ? "private"
        : "standard";

    const merkle = validateMerkle(input);
    if ("error" in merkle) {
      return NextResponse.json({ error: merkle.error }, { status: 400 });
    }

    if (mode === "private") {
      const required = [
        "denomination_id",
        "nullifier",
        "expected_merkle_root",
        "recipient",
        "value",
        "pk_b",
        "random",
      ];
      for (const field of required) {
        if (!(field in input)) {
          return NextResponse.json(
            { error: `Missing field: ${field}` },
            { status: 400 },
          );
        }
      }
      const denominationId = Number(input.denomination_id);
      if (
        !Number.isInteger(denominationId) ||
        denominationId < 0 ||
        denominationId > 10
      ) {
        return NextResponse.json(
          {
            error: `denomination_id must be an integer 0..10, got: ${input.denomination_id}`,
          },
          { status: 400 },
        );
      }

      const { proofHex } = await generateWithdrawDenomProof({
        denomination_id: denominationId,
        nullifier: String(input.nullifier),
        merkle_proof_length: merkle.merkleProofLength,
        expected_merkle_root: String(input.expected_merkle_root),
        recipient: String(input.recipient),
        value: String(input.value),
        pk_b: String(input.pk_b),
        random: String(input.random),
        merkle_proof_indices: merkle.indices,
        merkle_proof_siblings: merkle.siblings,
      });

      return NextResponse.json({ proof: proofHex, mode: "private" });
    }

    const required = [
      "value",
      "nullifier",
      "expected_merkle_root",
      "recipient",
      "pk_b",
      "random",
    ];
    for (const field of required) {
      if (!(field in input)) {
        return NextResponse.json(
          { error: `Missing field: ${field}` },
          { status: 400 },
        );
      }
    }

    const { proofHex } = await generateWithdrawProof({
      value: String(input.value),
      nullifier: String(input.nullifier),
      merkle_proof_length: merkle.merkleProofLength,
      expected_merkle_root: String(input.expected_merkle_root),
      recipient: String(input.recipient),
      pk_b: String(input.pk_b),
      random: String(input.random),
      merkle_proof_indices: merkle.indices,
      merkle_proof_siblings: merkle.siblings,
    });

    return NextResponse.json({ proof: proofHex, mode: "standard" });
  } catch (error) {
    console.error("Proof generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Proof generation failed: ${message}` },
      { status: 500 },
    );
  } finally {
    releaseLock();
  }
}
