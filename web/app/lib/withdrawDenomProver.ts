import { BackendType, Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { existsSync, readFileSync } from "fs";
import path from "path";

/**
 * Private-mode withdraw (withdraw_denom.nr).
 * Public: denomination_id, nullifier, merkle_proof_length, expected_merkle_root, recipient.
 * Private: value (must match ladder[id]), pk_b, random, merkle path.
 */
export type WithdrawDenomInputs = {
  denomination_id: number;
  nullifier: string;
  merkle_proof_length: number;
  expected_merkle_root: string;
  recipient: string;
  value: string;
  pk_b: string;
  random: string;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
};

/** Matches WithdrawDenomVerifier.sol calculateProofSize(LOG_N=14). Same layout as Standard withdraw. */
export const WITHDRAW_DENOM_EVM_PROOF_SIZE = 8000;

let noirInstance: Noir | null = null;
let backendInstance: UltraHonkBackend | null = null;
let barretenbergInstance: Barretenberg | null = null;
let initialized = false;
let loadedArtifactPath: string | null = null;

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
      console.info(`[withdrawDenomProver] resolved CIRCUITS_DIR=${dir}`);
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

async function initWithdrawDenomProver(): Promise<void> {
  if (initialized && noirInstance && backendInstance && barretenbergInstance) {
    return;
  }

  const circuitDir = resolveCircuitDir();
  // Never use with_foundry.json here — that is the Standard withdraw artifact.
  const artifactCandidates = [
    path.join(circuitDir, "target", "withdraw_denom_circuit.json"),
    path.join(circuitDir, "target", "with_foundry.denom.bak.json"),
  ];
  const artifactPath = artifactCandidates.find((p) => existsSync(p));
  if (!artifactPath) {
    throw new Error(
      `Withdraw-denom circuit artifact not found. Run: cd zk/circuits && bash ./scripts/compile_withdraw_denom_verifier.sh (then copy target/with_foundry.json → withdraw_denom_circuit.json). Searched: ${artifactCandidates.join(", ")}`,
    );
  }
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const params = (artifactJson?.abi?.parameters ?? []) as Array<{ name?: string }>;
  const first = params[0]?.name;
  if (first !== "denomination_id") {
    throw new Error(
      `Withdraw-denom artifact looks wrong (first abi param=${first ?? "none"}, expected denomination_id). Path: ${artifactPath}`,
    );
  }

  const api = await Barretenberg.new({
    threads: 1,
    backend: BackendType.Wasm,
    logger: (msg) => console.info(`[withdrawDenomProver:bb] ${msg}`),
  });
  const backend = new UltraHonkBackend(artifactJson.bytecode, api);
  const noir = new Noir(artifactJson);

  barretenbergInstance = api;
  backendInstance = backend;
  noirInstance = noir;
  loadedArtifactPath = artifactPath;
  initialized = true;
  console.info(
    `[withdrawDenomProver] loaded artifact ${artifactPath} backend=${BackendType.Wasm}`,
  );
}

export async function generateWithdrawDenomProof(
  inputs: WithdrawDenomInputs,
): Promise<{ proofHex: string }> {
  await initWithdrawDenomProver();

  if (!noirInstance || !backendInstance) {
    throw new Error("Withdraw-denom prover is not initialized");
  }

  const { witness } = await noirInstance.execute(inputs);
  const proofData = await backendInstance.generateProof(witness, {
    verifierTarget: "evm",
  });

  const proofBytes = Buffer.from(proofData.proof);
  if (proofBytes.length !== WITHDRAW_DENOM_EVM_PROOF_SIZE) {
    throw new Error(
      `Withdraw-denom proof length ${proofBytes.length} != ${WITHDRAW_DENOM_EVM_PROOF_SIZE} expected by WithdrawDenomVerifier (LOG_N=14). Artifact: ${loadedArtifactPath ?? "unknown"}.`,
    );
  }

  const ok = await backendInstance.verifyProof(proofData, {
    verifierTarget: "evm",
  });
  if (!ok) {
    throw new Error(
      "Withdraw-denom proof failed local UltraHonk verify before submit.",
    );
  }

  return { proofHex: `0x${proofBytes.toString("hex")}` };
}
