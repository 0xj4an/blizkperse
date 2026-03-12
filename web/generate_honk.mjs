import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

async function main() {
  const artifactPath = path.resolve("./zk/circuits/target/with_foundry.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(artifact.bytecode, api);
  const vk = await backend.getVerificationKey({ verifierTarget: "evm" });
  
  console.log("Generating EVM verifier...");
  try {
     const solidity = await backend.getSolidityVerifier(vk, { verifierTarget: "evm" });
     writeFileSync("./zk/contract/WithdrawVerifier.sol", solidity);
     console.log("Success! Saved to zk/contract/WithdrawVerifier.sol");
  } catch (e) {
     console.error("Failed to generate Solidity Verifier:", e.message);
  }
  
  await api.destroy();
}

main().catch(console.error);
