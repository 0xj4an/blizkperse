import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const ERC20_ABI = [
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"owner","type":"address"}],"outputs":[{"name":"","type":"uint256"}]}
];

const POOL_ABI = [
  {"type":"function","name":"deposit","stateMutability":"nonpayable","inputs":[{"name":"commitment","type":"bytes32"}],"outputs":[]}
];

function getCommitmentFromProverToml() {
  const circuitsDir = path.resolve(process.cwd(), "circuits");
  const proverPath = path.join(circuitsDir, "Prover.toml");
  const altPath = path.join(process.cwd(), "Prover.toml");
  const p = fs.existsSync(proverPath) ? proverPath : fs.existsSync(altPath) ? altPath : null;
  if (!p) return null;
  const content = fs.readFileSync(p, "utf8");
  const m = content.match(/new_commitment\s*=\s*"([^"]+)"/);
  return m ? m[1].trim() : null;
}

async function main() {
  const RPC = process.env.MONAD_RPC;
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS;
  const USDC = process.env.USDC_ADDRESS ?? "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

  if (!RPC || !PK || !POOL) throw new Error("Set MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS");

  let commitment = process.env.COMMITMENT;
  if (!commitment || !commitment.startsWith("0x") || commitment.length !== 66) {
    commitment = getCommitmentFromProverToml();
    if (commitment) console.log("Using new_commitment from Prover.toml:", commitment);
  }
  if (!commitment || !commitment.startsWith("0x") || commitment.length !== 66) {
    throw new Error("Set COMMITMENT (bytes32, 0x+64 hex) or run from repo root so Prover.toml is found. Or: COMMITMENT=$(node circuits/scripts/get_commitment.mjs)");
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  const bal = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", bal.toString());

  const amount = 1_000_000n; // 1 USDC (6 decimals)
  const tx1 = await usdc.approve(POOL, amount);
  console.log("approve tx:", tx1.hash);
  await tx1.wait();

  const tx2 = await pool.deposit(commitment);
  console.log("deposit tx:", tx2.hash);
  await tx2.wait();

  console.log("deposit done ✅");
}

main().catch((e) => { console.error(e); process.exit(1); });
