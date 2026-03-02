/**
 * Generate withdraw proof. Must use the SAME bb flags as zk/circuits/scripts/compile_withdraw_verifier.sh
 * (bb prove --oracle_hash keccak). See zk/docs/build-and-deploy.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, rm } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const execAsync = promisify(exec);

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

    // Use standard Prover.toml (nargo always looks for this file)
    // Generate unique witness/proof names to avoid conflicts
    const sessionId = randomBytes(8).toString("hex");
    const circuitDir = path.resolve(process.cwd(), "..", "zk", "circuits");
    const proverFile = path.join(circuitDir, "Prover.toml");
    const proofDir = path.join(circuitDir, "proofs", `proof_${sessionId}.proof`);
    const proofFile = path.join(proofDir, "proof");

    // Build Prover.toml content
    const indices = input.merkle_proof_indices.map((i: number) => String(i)).join(", ");
    const siblings = input.merkle_proof_siblings.map((s: string) => `"${s}"`).join(", ");

    const tomlContent = `value = "${input.value}"
nullifier = "${input.nullifier}"
merkle_proof_length = ${input.merkle_proof_length}
expected_merkle_root = "${input.expected_merkle_root}"
recipient = "${input.recipient}"
pk_b = "${input.pk_b}"
random = "${input.random}"
merkle_proof_indices = [${indices}]
merkle_proof_siblings = [${siblings}]
`;

    // Write Prover.toml
    await writeFile(proverFile, tomlContent, "utf8");

    try {
      // Step 1: Generate witness with nargo execute
      const { stdout: execOut, stderr: execErr } = await execAsync(
        `nargo execute proof_${sessionId}`,
        { cwd: circuitDir, timeout: 30000 }
      );
      console.log("nargo execute stdout:", execOut);
      if (execErr) console.log("nargo execute stderr:", execErr);

      const witnessFile = path.join(
        circuitDir,
        "target",
        `proof_${sessionId}.gz`,
      );

      // Step 2: Generate proof with bb (MUST match compile_withdraw_verifier.sh: same --oracle_hash keccak)
      const { stdout: proveOut, stderr: proveErr } = await execAsync(
        `bb prove -b ./target/with_foundry.json -w ./target/proof_${sessionId}.gz -o ./proofs/proof_${sessionId}.proof --oracle_hash keccak`,
        { cwd: circuitDir, timeout: 60000 }
      );
      console.log("bb prove stdout:", proveOut);
      if (proveErr) console.log("bb prove stderr:", proveErr);

      // Read the generated proof as binary and convert to hex
      const proofBuffer = await readFile(proofFile);
      const proofHex = `0x${proofBuffer.toString("hex")}`;

      // Clean up temporary files
      await unlink(proverFile).catch(() => {});
      await unlink(witnessFile).catch(() => {});
      await rm(proofDir, { recursive: true, force: true }).catch(() => {});

      return NextResponse.json({
        proof: proofHex,
      });
    } catch (err) {
      // Clean up on error
      await unlink(proverFile).catch(() => {});
      await unlink(
        path.join(circuitDir, "target", `proof_${sessionId}.gz`),
      ).catch(() => {});
      await rm(proofDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  } catch (error) {
    console.error("Proof generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Proof generation failed: ${message}` }, { status: 500 });
  } finally {
    releaseLock();
  }
}
