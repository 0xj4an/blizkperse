/**
 * Single 1 USDC deposit. For demo: call 5 times with PAYMENT_INDEX=0,1,2,3,4.
 *
 * Requires: MONAD_RPC, PRIVATE_KEY (POOL_ADDRESS, USDC_ADDRESS optional; have defaults)
 * Requires: PAYMENT_INDEX (0..4 for 5 demo payments)
 *
 * Usage:
 *   PAYMENT_INDEX=0 node circuits/scripts/deposit_one.mjs   # 1st payment A→B
 *   PAYMENT_INDEX=1 node circuits/scripts/deposit_one.mjs   # 2nd payment A→C
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
  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "DENOMINATION", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

// 1 USDC (6 decimals)
const ONE_USDC = 1_000_000n;

// Same recipient logic as deposit_multi: A→B, A→C, A→B, A→C, A→B
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
  const POOL = process.env.POOL_ADDRESS ?? "0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c";
  const USDC = process.env.USDC_ADDRESS ?? "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
  const index = process.env.PAYMENT_INDEX;

  if (!RPC || !PK) throw new Error("Set MONAD_RPC, PRIVATE_KEY");
  if (index === undefined || index === "") throw new Error("Set PAYMENT_INDEX (0, 1, 2, 3, 4 for 5 demo payments)");

  const paymentIndex = parseInt(index, 10);
  if (paymentIndex < 0 || paymentIndex >= RECIPIENTS.length) {
    throw new Error(`PAYMENT_INDEX must be 0..${RECIPIENTS.length - 1}`);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  // Use the pool's token and denomination (avoids mismatches with USDC_ADDRESS / DENOMINATION)
  const poolTokenAddress = await pool.usdc();
  const denomination = await pool.DENOMINATION();
  const token = new ethers.Contract(poolTokenAddress, ERC20_ABI, wallet);

  if (poolTokenAddress.toLowerCase() !== (USDC ?? "").toLowerCase()) {
    console.log("Warning: pool uses token", poolTokenAddress, "(.env USDC_ADDRESS:", USDC ?? "default", ")");
  }

  let bal;
  try {
    bal = await token.balanceOf(wallet.address);
  } catch (e) {
    if (e.code === "BAD_DATA" && e.value === "0x") {
      throw new Error(
        "Pool token (" + poolTokenAddress + ") not responding on this network (balanceOf returned empty). " +
        "This usually happens when the pool was deployed on a different network. " +
        "Fix: use the same RPC you used to deploy the pool."
      );
    }
    throw e;
  }
  console.log("Pool DENOMINATION:", denomination.toString(), "| Tu balance:", bal.toString());
  if (bal < denomination) throw new Error(`Need at least ${denomination} of token. Balance: ${bal}`);

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

  let allowance = await token.allowance(wallet.address, POOL);
  if (allowance < denomination) {
    console.log("Approving", denomination.toString(), "for pool (current allowance:", allowance.toString(), ")");
    const tx0 = await token.approve(POOL, denomination);
    console.log("approve tx:", tx0.hash);
    await tx0.wait();
    allowance = await token.allowance(wallet.address, POOL);
    console.log("Allowance after approve:", allowance.toString());
  }

  try {
    await pool.deposit.staticCall(commitment);
  } catch (simErr) {
    if (simErr.code === "CALL_EXCEPTION") {
      const reason = simErr.reason ?? simErr.shortMessage ?? "";
      if (reason.includes("commitment already used")) {
        throw new Error(
          "This commitment was already used in a previous deposit. With PAYMENT_INDEX=0 the commitment is always the same. " +
          "Try another index: PAYMENT_INDEX=1 (or 2, 3, 4), or change payment data to generate a new commitment."
        );
      }
      if (reason.includes("transferFrom failed")) {
        throw new Error(
          `transferFrom failed: pool charges DENOMINATION=${denomination}. Balance and allowance must be >= ${denomination}.`
        );
      }
      throw new Error(
        `deposit reverted: ${reason || "no message"}. Possible causes: (1) commitment already used → try PAYMENT_INDEX=1,2,3,4. (2) insufficient allowance/balance for ${denomination}.`
      );
    }
    throw simErr;
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
