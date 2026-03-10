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
      const response = await fetch("http://localhost:3000/api/generate-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs)
      });
      const data = await response.json();
      if (!data.proof) {
          console.error("No proof returned:", data);
          return;
      }
      const proofHex = data.proof;
      const proofBytes = Buffer.from(proofHex.slice(2), "hex");
      console.log("Total bytes:", proofBytes.length);
      console.log("Expected proof size (507 * 32) =", 507 * 32);
      console.log("Public inputs (5 * 32) =", 5 * 32);
      console.log("Does Total == Expected + PUIs?", proofBytes.length === (507 * 32 + 5 * 32));
      console.log("What about the +4 bytes? Total == Expected + PUIs + 4?", proofBytes.length === (507 * 32 + 5 * 32 + 4));
  } catch (e) {
      console.error(e);
  }
}
main();
