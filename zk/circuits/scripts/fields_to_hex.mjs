import fs from "fs";

const proofPath = "./target/proof_fields.txt/proof_fields.json";
const arr = JSON.parse(fs.readFileSync(proofPath, "utf8"));

// arr puede venir como ["123", "456"] o [123,456]
let hex = "0x";
for (const v of arr) {
  const x = BigInt(v);
  let h = x.toString(16);
  if (h.length > 64) throw new Error("Field element > 32 bytes");
  hex += h.padStart(64, "0");
}

fs.mkdirSync("./proofs", { recursive: true });
fs.writeFileSync("./proofs/with_foundry.proof", hex);

console.log("Wrote proofs/with_foundry.proof with", arr.length, "field elements");
