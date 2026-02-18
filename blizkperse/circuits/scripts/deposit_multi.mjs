/**
 * Demo: 5 depósitos de 1 USDC desde A hacia B/C (alternando).
 * Genera 5 commitments distintos (fórmula tipo circuito) y hace 5× deposit(commitment).
 * Requiere: MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS, USDC_ADDRESS
 * Requiere: 5 USDC en la wallet.
 *
 * Uso: desde repo root → node circuits/scripts/deposit_multi.mjs
 *      desde circuits/   → node scripts/deposit_multi.mjs
 */
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { Barretenberg, Fr } from "@aztec/bb.js";

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
];
const POOL_ABI = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },
];

const COUNT = Number(process.env.DEPOSIT_COUNT ?? 5);

function bytesToBigIntBE(bytes) {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) + BigInt(b);
  return x;
}

function toBigInt(frOrBytes) {
  if (typeof frOrBytes === "bigint") return frOrBytes;
  if (frOrBytes instanceof Fr) return BigInt(frOrBytes.toString());
  if (frOrBytes instanceof Uint8Array || Array.isArray(frOrBytes)) return bytesToBigIntBE(new Uint8Array(frOrBytes));
  if (frOrBytes?.value) return toBigInt(frOrBytes.value);
  throw new Error("Unknown type for toBigInt");
}

async function main() {
  const RPC = process.env.MONAD_RPC;
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS;
  const USDC = process.env.USDC_ADDRESS ?? "0x754704bc059f8c67012fed69bc8a327a5aafb603";

  if (!RPC || !PK || !POOL) throw new Error("Set MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  const bal = await usdc.balanceOf(wallet.address);
  const required = BigInt(COUNT) * 1_000_000n;
  if (bal < required) throw new Error(`Need ${COUNT} USDC (${required}), balance: ${bal}`);

  // Identidades demo: A=depositor, B y C=destinatarios (como Field en el circuito)
  const A = 1n;
  const B = 2n;
  const C = 3n;
  const value = 1n; // 1 "unidad" por nota

  const bb = await Barretenberg.new();

  async function poseidon2(a, b) {
    const out = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
    return toBigInt(out);
  }

  async function compute_entry(value, holder, random, nullifier) {
    const a = await poseidon2(value, holder);
    const b = await poseidon2(random, nullifier);
    return await poseidon2(a, b);
  }

  // 5 pagos: A→B, A→C, A→B, A→C, A→B (o A→C el último)
  const recipients = [B, C, B, C, B].slice(0, COUNT);
  const commitments = [];

  for (let i = 0; i < COUNT; i++) {
    const pk_b = recipients[i];
    const random = 100n + BigInt(i);
    const nullifier_in = 200n + BigInt(i);
    const nullifier_out = await poseidon2(random, pk_b);
    const entry_out = await compute_entry(value, pk_b, random, nullifier_out);
    const hexCommitment = "0x" + entry_out.toString(16).padStart(64, "0");
    commitments.push(hexCommitment);
    console.log(`Commitment ${i + 1} (A→${pk_b === B ? "B" : "C"}):`, hexCommitment);
  }

  await bb.destroy();

  // Un solo approve por todo
  const totalAmount = BigInt(COUNT) * 1_000_000n;
  const tx0 = await usdc.approve(POOL, totalAmount);
  console.log("approve tx:", tx0.hash);
  await tx0.wait();

  for (let i = 0; i < COUNT; i++) {
    const tx = await pool.deposit(commitments[i]);
    console.log(`deposit ${i + 1}/${COUNT} tx:`, tx.hash);
    await tx.wait();
  }

  console.log(`${COUNT} deposits done ✅`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
