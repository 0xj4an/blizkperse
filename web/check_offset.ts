import { generateWithdrawProof } from "./app/lib/withdrawProver";

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
      const offset = proofBytes.length - 7060;
      console.log("Difference (offset):", offset);
      
      const puiPrefix = proofBytes.subarray(0, offset);
      console.log(`Prefix hex (${offset} bytes):`, puiPrefix.toString('hex'));
      
      // Let's decode the prefix as 32-byte chunks if possible to see what it is
      for (let i = 0; i < offset; i += 32) {
         console.log(`Chunk ${i/32}:`, puiPrefix.subarray(i, i+32).toString('hex'));
      }
      
  } catch (e) {
      console.error(e);
  }
}
main();
