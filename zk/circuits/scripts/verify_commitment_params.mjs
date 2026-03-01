#!/usr/bin/env node
/**
 * Verifies which (pk_b, random) generate each on-chain commitment.
 * Usage: node scripts/verify_commitment_params.mjs
 * Requires: commitments in the order you want to test (edit ONCHAIN_COMMITMENTS below).
 */
import { Barretenberg, Fr } from "@aztec/bb.js";

function toBigInt(frOrBytes) {
  if (typeof frOrBytes === "bigint") return frOrBytes;
  if (frOrBytes instanceof Fr) return BigInt(frOrBytes.toString());
  throw new Error("Unexpected type");
}
function toHex64(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}

// The 3 on-chain commitments (order: 1st, 2nd, 3rd deposit)
const ONCHAIN_COMMITMENTS = [
  0x2f9862ec8acc10f0f10b02fafa2ff2d9a2d379f88a0755b598519dcd85baec0an,
  0x270d55aab8dea22d68274c85215ad18bb4afbc71344b3bdd5163d59085739ef2n,
  0x1976b263f57728d48060e51ae7a91ae7db37c614c645486a00e04414b5263550n,
];

async function main() {
  const bb = await Barretenberg.new();
  const poseidon2 = async (a, b) => {
    const out = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
    return toBigInt(out);
  };
  const computeEntry = async (value, holder, random, nullifier) => {
    const a = await poseidon2(value, holder);
    const b = await poseidon2(random, nullifier);
    return await poseidon2(a, b);
  };

  // Try various (pk_b, random) to find which generates each on-chain commitment
  const targets = [
    { leafIndex: 1, hex: "0x270d55aab8dea22d68274c85215ad18bb4afbc71344b3bdd5163d59085739ef2" },
    { leafIndex: 2, hex: "0x1976b263f57728d48060e51ae7a91ae7db37c614c645486a00e04414b5263550" },
  ];
  const pkOptions = [2n, 3n];
  const randomRange = [100n, 101n, 102n, 99n, 103n, 104n];

  console.log("Searching for (pk_b, random) that generate the commitments for leaf 1 and 2...\n");
  for (const t of targets) {
    const target = ONCHAIN_COMMITMENTS[t.leafIndex];
    let found = null;
    for (const pk_b of pkOptions) {
      for (const random of randomRange) {
        const nullifier = await poseidon2(random, pk_b);
        const entry = await computeEntry(1n, pk_b, random, nullifier);
        if (entry === target) {
          found = { pk_b, random, nullifier };
          break;
        }
      }
      if (found) break;
    }
    if (found) {
      console.log(`Leaf ${t.leafIndex} (${t.hex}): pk_b=${found.pk_b}, random=${found.random}`);
      console.log(`  nullifier = ${toHex64(found.nullifier)}`);
      console.log(`  → Paste into WithdrawProver.toml to withdraw that note.`);
    } else {
      console.log(`Leaf ${t.leafIndex}: no (pk_b, random) found in the tested range. Try more values.`);
    }
    console.log("");
  }

  await bb.destroy();
  console.log("If there is no match: deposits 2 and 3 were made with different (pk_b, random),");
  console.log("e.g. from the frontend. You need the holder_pk and randomness of that note (DB or receive flow).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
