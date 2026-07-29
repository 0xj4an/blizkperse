import { BackendType, Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { existsSync, readFileSync } from "fs";
import path from "path";

type WithdrawInputs = {
  value: string;
  nullifier: string;
  merkle_proof_length: number;
  expected_merkle_root: string;
  recipient: string;
  pk_b: string;
  random: string;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
};

let noirInstance: Noir | null = null;
let backendInstance: UltraHonkBackend | null = null;
let barretenbergInstance: Barretenberg | null = null;
let initialized = false;

function resolveCircuitDir(): string {
  const envCircuitsDir = process.env.CIRCUITS_DIR;
  const candidates = [
    ...(envCircuitsDir ? [envCircuitsDir] : []),
    "/app/zk/circuits",
    "/app/circuits",
    path.resolve(process.cwd(), "zk", "circuits"),
    path.resolve(process.cwd(), "circuits"),
    path.resolve(process.cwd(), "..", "zk", "circuits"),
    path.resolve(process.cwd(), "..", "..", "zk", "circuits"),
  ];
  const unique = [...new Set(candidates)];

  for (const dir of unique) {
    if (existsSync(path.join(dir, "Nargo.toml"))) {
      console.info(`[withdrawProver] resolved CIRCUITS_DIR=${dir}`);
      return dir;
    }
  }

  const status = unique
    .map((dir) => `${dir} (exists=${existsSync(dir) ? "yes" : "no"})`)
    .join("; ");
  throw new Error(
    `Circuit directory not found (need Nargo.toml). cwd=${process.cwd()} CIRCUITS_DIR=${envCircuitsDir ?? "(unset)"} candidates: ${status}`,
  );
}

async function initWithdrawProver(): Promise<void> {
  if (initialized && noirInstance && backendInstance && barretenbergInstance) {
    return;
  }

  const circuitDir = resolveCircuitDir();
  const artifactPath = path.join(circuitDir, "target", "with_foundry.json");
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));

  // Force WASM — native bb under Next can hang; mirror depositProver.
  const api = await Barretenberg.new({
    threads: 1,
    backend: BackendType.Wasm,
  });
  const backend = new UltraHonkBackend(artifactJson.bytecode, api);
  const noir = new Noir(artifactJson);

  barretenbergInstance = api;
  backendInstance = backend;
  noirInstance = noir;
  initialized = true;
}

export async function generateWithdrawProof(
  inputs: WithdrawInputs,
): Promise<{ proofHex: string }> {
  await initWithdrawProver();

  if (!noirInstance || !backendInstance) {
    throw new Error("Withdraw prover is not initialized");
  }

  const { witness } = await noirInstance.execute(inputs);

  const proofData = await backendInstance.generateProof(witness, {
    verifierTarget: "evm",
  });

  const proofBytes = Buffer.from(proofData.proof);
  const proofHex = `0x${proofBytes.toString("hex")}`;

  return { proofHex };
}

