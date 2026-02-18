/**
 * Un solo pago de 1 USDC (un depósito). Para demo: llamar 5 veces con PAYMENT_INDEX=0,1,2,3,4.
 * Luego un botón puede invocar este script (o una API que lo ejecute) con el índice deseado.
 *
 * Requiere: MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS, USDC_ADDRESS, PAYMENT_INDEX (0..4 para 5 pagos)
 *
 * Uso:
 *   PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs   # 1er pago A→B
 *   PAYMENT_INDEX=1 node circuits/scripts/deposit_one.mjs   # 2º pago A→C
 *   ...
 */
import { ethers } from "ethers";
import { Barretenberg, Fr } from "@aztec/bb.js";

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
];
const POOL_ABI = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },
];

const ONE_USDC = 1_000_000n;

// Misma lógica de destinatarios que deposit_multi: A→B, A→C, A→B, A→C, A→B
const B = 2n;
const C = 3n;
const RECIPIENTS = [B, C, B, C, B];

function toBigInt(frOrBytes) {
  if (typeof frOrBytes === "bigint") return frOrBytes;
  if (frOrBytes instanceof Fr) return BigInt(frOrBytes.toString());
  throw new Error("Unexpected type");
}

async function main() {
  const RPC = process.env.MONAD_RPC;
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS;
  const USDC = process.env.USDC_ADDRESS ?? "0x754704bc059f8c67012fed69bc8a327a5aafb603";
  const index = process.env.PAYMENT_INDEX;

  if (!RPC || !PK || !POOL) throw new Error("Set MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS");
  if (index === undefined || index === "") throw new Error("Set PAYMENT_INDEX (0, 1, 2, 3, 4 para 5 pagos demo)");

  const paymentIndex = parseInt(index, 10);
  if (paymentIndex < 0 || paymentIndex >= RECIPIENTS.length) {
    throw new Error(`PAYMENT_INDEX must be 0..${RECIPIENTS.length - 1}`);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  const bal = await usdc.balanceOf(wallet.address);
  if (bal < ONE_USDC) throw new Error(`Need 1 USDC, balance: ${bal}`);

  const pk_b = RECIPIENTS[paymentIndex];
  const value = 1n;
  const random = 100n + BigInt(paymentIndex);

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

  const nullifier_out = await poseidon2(random, pk_b);
  const entry_out = await compute_entry(value, pk_b, random, nullifier_out);
  const commitment = "0x" + entry_out.toString(16).padStart(64, "0");
  await bb.destroy();

  const toLabel = pk_b === B ? "B" : "C";
  console.log(`Payment ${paymentIndex + 1} (A→${toLabel}), commitment:`, commitment);

  const allowance = await usdc.allowance(wallet.address, POOL);
  if (allowance < ONE_USDC) {
    const tx0 = await usdc.approve(POOL, ONE_USDC);
    console.log("approve tx:", tx0.hash);
    await tx0.wait();
  }

  const tx = await pool.deposit(commitment);
  console.log("deposit tx:", tx.hash);
  await tx.wait();
  console.log("deposit done ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
