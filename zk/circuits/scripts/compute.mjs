import { Barretenberg, Fr } from "@aztec/bb.js";

const bb = await Barretenberg.new();

function bytesToBigIntBE(bytes) {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) + BigInt(b);
  return x;
}

const toBigInt = (frOrBytes) => {
  // frOrBytes puede ser Fr o Uint8Array/number[]
  if (typeof frOrBytes === "bigint") return frOrBytes;

  // Fr suele tener toBuffer()/toBytes() dependiendo versión
  if (frOrBytes instanceof Fr) {
    const buf = frOrBytes.toBuffer?.() ?? frOrBytes.toBytes?.();
    return bytesToBigIntBE(buf);
  }

  // Si ya es bytes
  if (frOrBytes instanceof Uint8Array || Array.isArray(frOrBytes)) {
    return bytesToBigIntBE(frOrBytes);
  }

  // fallback: intenta value (algunas versiones devuelven { value: Uint8Array })
  if (frOrBytes?.value) return toBigInt(frOrBytes.value);

  throw new Error("Unknown type for toBigInt");
};

const hex = (x) => "0x" + x.toString(16);

async function poseidon2(a, b) {
  const out = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
  // out puede ser Fr o { value: bytes }
  return toBigInt(out);
}

async function compute_entry(value, holder, random, nullifier) {
  const a = await poseidon2(value, holder);
  const b = await poseidon2(random, nullifier);
  return await poseidon2(a, b);
}

// inputs
const value = 0x5n;
const from = 0x7n;
const random = 0x9n;
const nullifier_in = 0x2n;
const pk_b = 0x13n;

const nullifier_out = await poseidon2(random, pk_b);
const entry_in = await compute_entry(value, from, random, nullifier_in);
const entry_out = await compute_entry(value, pk_b, random, nullifier_out);

const root = await poseidon2(entry_in, 0n);
const root_alt = await poseidon2(0n, entry_in);

console.log("Poseidon2: ", await poseidon2(value, from));
console.log("Poseidon2: ", await poseidon2(random, nullifier_in));
console.log("nullifier_out =", hex(nullifier_out));
console.log("entry_in      =", hex(entry_in));
console.log("entry_out     =", hex(entry_out));
console.log("root          =", hex(root));
console.log("root_alt      =", hex(root_alt));

await bb.destroy();
