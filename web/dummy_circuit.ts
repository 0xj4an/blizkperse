import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { readFileSync } from "fs";

async function main() {
    const api = await Barretenberg.new();
    const artifact = JSON.parse(readFileSync("./dummy_circuit/target/dummy_circuit.json"));
    const backend = new UltraHonkBackend(artifact.bytecode, api);
    const noir = new Noir(artifact);

    // Provide 0x42 as public input so it's easy to spot
    const { witness } = await noir.execute({ x: "1", y: "0x42" });
    
    const proofDataEVM = await backend.generateProof(witness, { verifierTarget: "evm" });
    const proofDataDefault = await backend.generateProof(witness);

    console.log("EVM Proof bytes length:", proofDataEVM.proof.length);
    console.log("Default Proof bytes length:", proofDataDefault.proof.length);
}
main();
