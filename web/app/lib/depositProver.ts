import { BackendType, Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
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

/** Matches DepositVerifier.sol calculateProofSize(LOG_N=12). */
export const DEPOSIT_EVM_PROOF_SIZE = 7232;

let noirInstance: Noir | null = null;
let backendInstance: UltraHonkBackend | null = null;
let barretenbergInstance: Barretenberg | null = null;
let initialized = false;
let loadedArtifactPath: string | null = null;

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
  // Never fall back to with_foundry.json (withdraw circuit, LOG_N=14) — that
  // yields the wrong proof length for DepositVerifier (expects 7232).
  const artifactCandidates = [
    path.join(circuitDir, "target", "deposit_circuit.json"),
    path.join(circuitDir, "target", "deposit.json"),
  ];
  const artifactPath = artifactCandidates.find((p) => existsSync(p));
  if (!artifactPath) {
    throw new Error(
      `Deposit circuit artifact not found. Run: cd zk/circuits && bash ./scripts/compile_deposit_verifier.sh. Searched: ${artifactCandidates.join(", ")}`,
    );
  }
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));

  // Force WASM: default backend order prefers native bb (Unix socket), which can
  // hang/crash under Next.js. Single-threaded WASM is reliable (~1–2s prove).
  const api = await Barretenberg.new({
    threads: 1,
    backend: BackendType.Wasm,
    logger: (msg) => console.info(`[depositProver:bb] ${msg}`),
  });
  const backend = new UltraHonkBackend(artifactJson.bytecode, api);
  const noir = new Noir(artifactJson);

  barretenbergInstance = api;
  backendInstance = backend;
  noirInstance = noir;
  loadedArtifactPath = artifactPath;
  initialized = true;
  console.info(
    `[depositProver] loaded artifact ${artifactPath} backend=${BackendType.Wasm}`,
  );
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

  const proofBytes = Buffer.from(proofData.proof);
  if (proofBytes.length !== DEPOSIT_EVM_PROOF_SIZE) {
    throw new Error(
      `Deposit proof length ${proofBytes.length} != ${DEPOSIT_EVM_PROOF_SIZE} expected by DepositVerifier (LOG_N=12). Artifact: ${loadedArtifactPath ?? "unknown"}. Recompile deposit circuit; do not use with_foundry.json.`,
    );
  }

  const ok = await backendInstance.verifyProof(proofData, {
    verifierTarget: "evm",
  });
  if (!ok) {
    throw new Error(
      "Deposit proof failed local UltraHonk verify before submit. Regenerating may help; check circuit artifact matches deployed verifier.",
    );
  }

  const proofHex = `0x${proofBytes.toString("hex")}`;
  const publicInputs = [inputs.value, inputs.commitment];

  return { proofHex, publicInputs };
}
