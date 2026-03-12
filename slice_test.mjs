import { generateWithdrawProof } from "./web/app/lib/withdrawProver.js";

async function main() {
  const inputs = {
      value: "1",
      nullifier: "0",
      merkle_proof_length: 10,
      expected_merkle_root: "0",
      recipient: "0",
      pk_b: "0",
      random: "0",
      merkle_proof_indices: new Array(10).fill(0),
      merkle_proof_siblings: new Array(10).fill("0"),
  };
  try {
      const { proofHex } = await generateWithdrawProof(inputs);
      const proofBytes = Buffer.from(proofHex.slice(2), "hex");
      console.log("Total bytes:", proofBytes.length);
      console.log("Expected proof size in contract:", 7060);
      console.log("Difference:", proofBytes.length - 7060);
      
      // Let's print the first 256 bytes to see where the public inputs are
      console.log("First 200 bytes hex:");
      console.log(proofBytes.subarray(0, 200).toString("hex"));
  } catch (e) {
      console.error(e);
  }
}
main();
