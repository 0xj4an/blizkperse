import fs from "fs";

const input = fs.readFileSync("/Users/0xj4an/.claude/projects/-Users-0xj4an-Documents-GitHub-0xj4an-personal-blizkperse/75757a46-08d2-4891-a54f-1f57a0660f4e/tool-results/toolu_01RQ8dqbm2YccUVEr2YibBrk.txt", "utf8");
const inputData = input.split("\n")[10].split("0x")[1];

// Skip function selector (4 bytes = 8 hex chars)
const params = inputData.slice(8);

// First 32 bytes (64 hex chars) = offset to proof
const proofOffset = parseInt(params.slice(0, 64), 16);
console.log("Proof offset:", proofOffset);

// At proof offset, first 32 bytes = proof length
const proofLengthHex = params.slice(proofOffset * 2, proofOffset * 2 + 64);
const proofLength = parseInt(proofLengthHex, 16);
console.log("Proof length:", proofLength, "bytes");
console.log("Proof length:", proofLength * 2, "hex chars");

// Second 32 bytes = offset to public inputs
const publicInputsOffset = parseInt(params.slice(64, 128), 16);
console.log("\nPublic inputs offset:", publicInputsOffset);

// At public inputs offset, first 32 bytes = array length
const piLengthHex = params.slice(publicInputsOffset * 2, publicInputsOffset * 2 + 64);
const piLength = parseInt(piLengthHex, 16);
console.log("Public inputs count:", piLength);
