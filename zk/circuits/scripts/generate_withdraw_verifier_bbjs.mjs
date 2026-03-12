#!/usr/bin/env node
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const circuitDir = path.resolve(__dirname, "..");
const targetDir = path.join(circuitDir, "target");
const artifactPath = path.join(targetDir, "with_foundry.json");
const verifierPath = path.join(targetDir, "Verifier.sol");
const vkPath = path.join(targetDir, "vk");
const proofPath = path.join(targetDir, "proof");
const publicInputsPath = path.join(targetDir, "public_inputs.json");
const defaultInputsPath = path.join(circuitDir, "withdraw_inputs.json");

function log(message) {
  console.log(`[bb.js] ${message}`);
}

function warn(message) {
  console.warn(`[bb.js] Warning: ${message}`);
}

async function main() {
  if (!existsSync(artifactPath)) {
    throw new Error(`Circuit artifact not found: ${artifactPath}`);
  }

  mkdirSync(targetDir, { recursive: true });

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const api = await Barretenberg.new({ threads: 4 });

  try {
    log("Generating EVM verifier from target/with_foundry.json");
    const backend = new UltraHonkBackend(artifact.bytecode, api);
    const vk = await backend.getVerificationKey({ verifierTarget: "evm" });
    const solidity = await backend.getSolidityVerifier(vk, {
      verifierTarget: "evm",
    });

    writeFileSync(vkPath, Buffer.from(vk));
    writeFileSync(verifierPath, solidity);
    log("Wrote target/vk and target/Verifier.sol");

    if (process.env.SKIP_SMOKE_TEST === "1") {
      log("Skipping smoke test because SKIP_SMOKE_TEST=1");
      return;
    }

    const inputsPath = process.env.WITHDRAW_INPUTS_FILE ?? defaultInputsPath;
    if (!existsSync(inputsPath)) {
      warn(`inputs file not found, skipping smoke test: ${inputsPath}`);
      return;
    }

    try {
      log(`Running smoke test with ${path.basename(inputsPath)}`);
      const inputs = JSON.parse(readFileSync(inputsPath, "utf8"));
      const noir = new Noir(artifact);
      const { witness } = await noir.execute(inputs);
      const proofData = await backend.generateProof(witness, {
        verifierTarget: "evm",
      });

      writeFileSync(proofPath, Buffer.from(proofData.proof));
      writeFileSync(publicInputsPath, JSON.stringify(proofData.publicInputs, null, 2));
      log(
        `Smoke test generated proof (${proofData.proof.length} bytes, ${proofData.publicInputs.length} public inputs)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(`smoke test failed: ${message}`);
    }
  } finally {
    await api.destroy();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bb.js] Failed: ${message}`);
  process.exit(1);
});
