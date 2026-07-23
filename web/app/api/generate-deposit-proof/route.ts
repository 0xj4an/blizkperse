import { NextRequest, NextResponse } from "next/server";
import { generateDepositProof } from "../../lib/depositProver";

export const maxDuration = 120;

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
    const required = ["value", "commitment", "pk_b", "random", "nullifier"];
    for (const field of required) {
      if (!(field in input)) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
      }
    }

    const normalized = {
      value: String(input.value),
      commitment: String(input.commitment),
      pk_b: String(input.pk_b),
      random: String(input.random),
      nullifier: String(input.nullifier),
    };

    const { proofHex, publicInputs } = await generateDepositProof(normalized);
    return NextResponse.json({ proof: proofHex, publicInputs });
  } catch (error) {
    console.error("Deposit proof generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Deposit proof generation failed: ${message}` }, { status: 500 });
  } finally {
    releaseLock();
  }
}
