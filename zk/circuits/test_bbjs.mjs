#!/usr/bin/env node
// Test: generate VK + proof using @aztec/bb.js UltraHonkBackend
// with verifierTarget: 'evm' (keccak + ZK enabled) to match deployed verifier.
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { readFileSync } from "fs";

const circuit = JSON.parse(readFileSync("./target/with_foundry.json", "utf8"));

function loadInputs() {
  const fromEnv = process.env.WITHDRAW_INPUTS_FILE;
  if (fromEnv) {
    const raw = readFileSync(fromEnv, "utf8");
    return JSON.parse(raw);
  }

  // Default demo inputs (single-leaf tree, depth = 10)
  return {
    value: "0x1",
    nullifier:
      "0x2f2db3ebc29365d92b4c3c567ec37494c011331eedf2eb88972d6a5aee08d400",
    merkle_proof_length: 10,
    expected_merkle_root:
      "0x0a62791fbdee39736adb8d9cfe0c34e5f6749e4d1eb0b89cc23941b228ca4414",
    recipient:
      "0x000000000000000000000000635BB386312470490Dd5864258bcb7Ab505bF42d",
    pk_b: "0x2",
    random: "0x64",
    merkle_proof_indices: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    merkle_proof_siblings: [
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864",
      "0x1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1",
      "0x18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238",
      "0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a",
      "0x2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55",
      "0x2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78",
      "0x078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d",
      "0x2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61",
      "0x0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747",
    ],
  };
}

async function main() {
  const inputs = loadInputs();
  console.log("Initializing Barretenberg...");
  const api = await Barretenberg.new({ threads: 4 });

  console.log("Creating UltraHonkBackend with EVM target...");
  const backend = new UltraHonkBackend(circuit.bytecode, api);

  console.log("Creating Noir instance...");
  const noir = new Noir(circuit);

  console.log("Generating witness...");
  const { witness } = await noir.execute(inputs);

  // Generate proof with verifierTarget: 'evm' (keccak + ZK enabled)
  console.log("Generating proof with verifierTarget: 'evm'...");
  const proof = await backend.generateProof(witness, { verifierTarget: 'evm' });

  console.log("Proof size (bytes):", proof.proof.length);
  console.log("Proof field elements:", proof.proof.length / 32);
  console.log("Public inputs count:", proof.publicInputs.length);

  // Get VK
  console.log("Getting VK with verifierTarget: 'evm'...");
  const vk = await backend.getVerificationKey({ verifierTarget: 'evm' });
  console.log("VK size (bytes):", vk.length);

  // Check circuit size from VK — first 32 bytes are circuit_size
  const circuitSize = Number(BigInt("0x" + Buffer.from(vk.slice(0, 32)).toString("hex")));
  const logCircuitSize = Number(BigInt("0x" + Buffer.from(vk.slice(32, 64)).toString("hex")));
  console.log("Circuit size (N):", circuitSize);
  console.log("Log circuit size:", logCircuitSize);

  // Get Solidity verifier
  console.log("Getting Solidity verifier...");
  const solidity = await backend.getSolidityVerifier(vk, { verifierTarget: 'evm' });
  // Extract N from the solidity code
  const nMatch = solidity.match(/uint256 constant N = (\d+)/);
  const logNMatch = solidity.match(/uint256 constant LOG_N = (\d+)/);
  const proofSizeMatch = solidity.match(/uint256 constant CONST_PROOF_SIZE_LOG_N = (\d+)/);
  console.log("Solidity N:", nMatch?.[1]);
  console.log("Solidity LOG_N:", logNMatch?.[1]);
  console.log("Solidity CONST_PROOF_SIZE_LOG_N:", proofSizeMatch?.[1]);

  // Save proof for testing
  const { writeFileSync } = await import("fs");
  writeFileSync("./target/proof_evm.bin", Buffer.from(proof.proof));
  writeFileSync("./target/Verifier_evm.sol", solidity);
  console.log("Saved proof to ./target/proof_evm.bin");
  console.log("Saved verifier to ./target/Verifier_evm.sol");

  await api.destroy();
}

main().catch(err => { console.error(err); process.exit(1); });
