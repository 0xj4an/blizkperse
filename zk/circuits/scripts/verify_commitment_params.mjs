#!/usr/bin/env node
/**
 * Verifica qué (pk_b, random) generan cada commitment on-chain.
 * Uso: node scripts/verify_commitment_params.mjs
 * Requiere: commitments en el orden que quieras probar (edita ONCHAIN_COMMITMENTS abajo).
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

// Los 3 commitments on-chain (orden: 1º, 2º, 3º deposit)
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

  // Probar varios (pk_b, random) para encontrar cuál genera cada commitment on-chain
  const targets = [
    { leafIndex: 1, hex: "0x270d55aab8dea22d68274c85215ad18bb4afbc71344b3bdd5163d59085739ef2" },
    { leafIndex: 2, hex: "0x1976b263f57728d48060e51ae7a91ae7db37c614c645486a00e04414b5263550" },
  ];
  const pkOptions = [2n, 3n];
  const randomRange = [100n, 101n, 102n, 99n, 103n, 104n];

  console.log("Buscando (pk_b, random) que generen los commitments de hoja 1 y 2...\n");
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
      console.log(`Hoja ${t.leafIndex} (${t.hex}): pk_b=${found.pk_b}, random=${found.random}`);
      console.log(`  nullifier = ${toHex64(found.nullifier)}`);
      console.log(`  → Pega en WithdrawProver.toml para retirar esa nota.`);
    } else {
      console.log(`Hoja ${t.leafIndex}: no se encontró (pk_b, random) en el rango probado. Prueba más valores.`);
    }
    console.log("");
  }

  await bb.destroy();
  console.log("Si no hay coincidencia: los depósitos 2 y 3 se hicieron con otros (pk_b, random),");
  console.log("p. ej. desde el frontend. Necesitas holder_pk y randomness de esa nota (DB o flujo receive).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
