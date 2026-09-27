import { NextRequest, NextResponse } from "next/server";
import { generateDepositProof } from "../../lib/depositProver";
import { requireWalletAuth } from "@/lib/server-auth";

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
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

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
    const proofByteLen = (proofHex.length - 2) / 2;
    console.info(
      `[generate-deposit-proof] proofBytes=${proofByteLen} publicInputs=${publicInputs.length}`,
    );
    return NextResponse.json({ proof: proofHex, publicInputs, proofByteLen });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Deposit proof generation error:", message);
    return NextResponse.json(
      { error: `Deposit proof generation failed: ${message}` },
      { status: 500 },
    );
  } finally {
    releaseLock();
  }
}
