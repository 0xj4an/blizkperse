import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { existsSync, readFileSync } from "fs";
import path from "path";

export type DepositInputs = {
  value: string;
  commitment: string;
  pk_b: string;
  random: string;
  nullifier: string;
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
    `Circuit directory not found. Set CIRCUITS_DIR env var. Searched: ${candidates.join(", ")}`,
  );
}

async function initDepositProver(): Promise<void> {
  if (initialized && noirInstance && backendInstance && barretenbergInstance) {
    return;
  }

  const circuitDir = resolveCircuitDir();
  const artifactCandidates = [
    path.join(circuitDir, "target", "deposit_circuit.json"),
    path.join(circuitDir, "target", "deposit.json"),
    path.join(circuitDir, "target", "with_foundry.json"),
  ];
  const artifactPath = artifactCandidates.find((p) => existsSync(p));
  if (!artifactPath) {
    throw new Error(
      `Deposit circuit artifact not found. Run: cd zk/circuits && bash ./scripts/compile_deposit_verifier.sh. Searched: ${artifactCandidates.join(", ")}`,
    );
  }
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));

  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(artifactJson.bytecode, api);
  const noir = new Noir(artifactJson);

  barretenbergInstance = api;
  backendInstance = backend;
  noirInstance = noir;
  initialized = true;
}

export async function generateDepositProof(
  inputs: DepositInputs,
): Promise<{ proofHex: string; publicInputs: string[] }> {
  await initDepositProver();

  if (!noirInstance || !backendInstance) {
    throw new Error("Deposit prover is not initialized");
  }

  const { witness } = await noirInstance.execute(inputs);
  const proofData = await backendInstance.generateProof(witness, {
    verifierTarget: "evm",
  });

  const proofHex = `0x${Buffer.from(proofData.proof).toString("hex")}`;
  const publicInputs = [
    inputs.value,
    inputs.commitment,
  ];

  return { proofHex, publicInputs };
}
