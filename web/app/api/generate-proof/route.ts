/**
 * Generate withdraw proof. Must use the SAME bb flags as zk/circuits/scripts/compile_withdraw_verifier.sh
 * (bb prove --oracle_hash keccak). See zk/docs/build-and-deploy.md.
 */
import { NextRequest, NextResponse } from "next/server";

// Allow long-running proof generation on Railway/Vercel (nargo + bb can take 30–90s)
export const maxDuration = 120;
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const execAsync = promisify(exec);

// Resolve the circuits directory robustly across dev/standalone/Docker environments.
// In dev mode: cwd = web/ → ../zk/circuits
// In standalone: cwd = .next/standalone/ → ../../zk/circuits (or env var)
function resolveCircuitDir(): string {
  if (process.env.CIRCUITS_DIR) {
    return process.env.CIRCUITS_DIR;
  }
  const candidates = [
    path.resolve(process.cwd(), "..", "zk", "circuits"),
    path.resolve(process.cwd(), "zk", "circuits"),
    path.resolve(process.cwd(), "..", "..", "zk", "circuits"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "Nargo.toml"))) {
      return dir;
    }
  }
  throw new Error(
    `Circuit directory not found. Set CIRCUITS_DIR env var. Searched: ${candidates.join(", ")}`,
  );
}

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

    // Use standard Prover.toml (nargo always looks for this file)
    // Generate unique witness/proof names to avoid conflicts
    const sessionId = randomBytes(8).toString("hex");
    const circuitDir = resolveCircuitDir();
    const proverFile = path.join(circuitDir, "Prover.toml");
    const proofDir = path.join(circuitDir, "proofs", `proof_${sessionId}.proof`);
    const proofFile = path.join(proofDir, "proof");

    // Build Prover.toml content (use validated length and arrays)
    const indicesStr = indices.map((i: number) => String(Number(i))).join(", ");
    const siblingsStr = siblings.map((s: string) => `"${String(s).trim()}"`).join(", ");

    const tomlContent = `value = "${input.value}"
nullifier = "${input.nullifier}"
merkle_proof_length = ${merkleProofLength}
expected_merkle_root = "${input.expected_merkle_root}"
recipient = "${input.recipient}"
pk_b = "${input.pk_b}"
random = "${input.random}"
merkle_proof_indices = [${indicesStr}]
merkle_proof_siblings = [${siblingsStr}]
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
      let proveOut = "", proveErr = "";
      try {
        const result = await execAsync(
          `bb prove -b ./target/with_foundry.json -w ./target/proof_${sessionId}.gz -o ./proofs/proof_${sessionId}.proof --oracle_hash keccak`,
          { cwd: circuitDir, timeout: 60000 }
        );
        proveOut = result.stdout;
        proveErr = result.stderr ?? "";
      } catch (bbErr: unknown) {
        const errMsg = bbErr instanceof Error ? bbErr.message : String(bbErr);
        const stderr = bbErr && typeof bbErr === "object" && "stderr" in bbErr ? String((bbErr as { stderr?: string }).stderr ?? "") : "";
        console.error("bb prove failed:", errMsg, "stderr:", stderr);
        if (errMsg.includes("Length is too large") || (stderr && stderr.includes("Length is too large"))) {
          throw new Error(
            "Length is too large: merkle_proof_length must be 10 and merkle_proof_indices/siblings must have exactly 10 elements (circuit MAX_DEPTH=10). If the error persists, the witness or artifact may not match this bb version."
          );
        }
        throw bbErr;
      }
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
