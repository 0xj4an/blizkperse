import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
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
    `Circuit directory not found. Set CIRCUITS_DIR env var. Searched: ${candidates.join(
      ", ",
    )}`,
  );
}

async function initWithdrawProver(): Promise<void> {
  if (initialized && noirInstance && backendInstance && barretenbergInstance) {
    return;
  }

  const circuitDir = resolveCircuitDir();
  const artifactPath = path.join(circuitDir, "target", "with_foundry.json");
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));

  const api = await Barretenberg.new();
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

  const proofHex = `0x${Buffer.from(proofData.proof).toString("hex")}`;

  return { proofHex };
}

