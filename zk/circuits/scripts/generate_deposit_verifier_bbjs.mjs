#!/usr/bin/env node
/**
 * Generate DepositHonkVerifier.sol via bb.js (preferred over bb CLI when versions diverge).
 * Smoke-tests witness + EVM proof using poseidon-lite (matches noir poseidon::bn254::hash_2).
 */
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { poseidon2 } from "poseidon-lite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const circuitDir = path.resolve(__dirname, "..");
const targetDir = path.join(circuitDir, "target");
const artifactPath = path.join(targetDir, "deposit_circuit.json");
const verifierPath = path.join(targetDir, "DepositVerifier.sol");
const contractPath = path.resolve(circuitDir, "..", "contract", "DepositVerifier.sol");

function toHex64(x) {
  return `0x${BigInt(x).toString(16).padStart(64, "0")}`;
}

function hash2(a, b) {
  return poseidon2([a, b]);
}

async function main() {
  if (!existsSync(artifactPath)) {
    throw new Error(`Missing ${artifactPath}. Run nargo compile with deposit circuit first.`);
  }

  mkdirSync(targetDir, { recursive: true });
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const api = await Barretenberg.new({ threads: 1 });

  try {
    console.log("[bb.js] Generating EVM DepositVerifier from deposit_circuit.json");
    console.log("[bb.js] noir_version in artifact:", artifact.noir_version ?? "(unknown)");
    const backend = new UltraHonkBackend(artifact.bytecode, api);
    const vk = await backend.getVerificationKey({ verifierTarget: "evm" });
    let solidity = await backend.getSolidityVerifier(vk, { verifierTarget: "evm" });
    solidity = solidity
      .replace(/contract HonkVerifier/g, "contract DepositHonkVerifier")
      .replace(/contract UltraVerifier/g, "contract DepositHonkVerifier");
    writeFileSync(verifierPath, solidity);
    writeFileSync(contractPath, solidity);
    console.log("[bb.js] Wrote", verifierPath);
    console.log("[bb.js] Wrote", contractPath);

    const value = 1n;
    const pk_b = 2n;
    const random = 100n;
    const nullifier = hash2(random, pk_b);
    const commitment = hash2(hash2(value, pk_b), hash2(random, nullifier));

    const inputs = {
      value: toHex64(value),
      commitment: toHex64(commitment),
      pk_b: toHex64(pk_b),
      random: toHex64(random),
      nullifier: toHex64(nullifier),
    };
    writeFileSync(path.join(circuitDir, "deposit_inputs.json"), JSON.stringify(inputs, null, 2));

    const noir = new Noir(artifact);
    const { witness } = await noir.execute(inputs);
    const proofData = await backend.generateProof(witness, { verifierTarget: "evm" });
    console.log(
      `[bb.js] Smoke proof OK (${proofData.proof.length} bytes, ${proofData.publicInputs.length} public inputs)`,
    );
  } finally {
    await api.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
