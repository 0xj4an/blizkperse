/**
 * Registra en la ShieldedPool el root que usa el circuito withdraw (expected_merkle_root).
 * Sin este root, withdraw() revertirá con "unknown root".
 *
 * Requiere: MONAD_RPC, PRIVATE_KEY (POOL_ADDRESS opcional; default: pool desplegada)
 * Opcional: ROOT=0x... (si no se pasa, se lee expected_merkle_root de WithdrawProver.toml)
 *
 * Uso:
 *   node circuits/scripts/register_root.mjs
 *   node scripts/register_root.mjs   # desde repo root (runner)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POOL_ABI = [
  { type: "function", name: "registerRoot", stateMutability: "nonpayable", inputs: [{ name: "root", type: "bytes32" }], outputs: [] },
  { type: "function", name: "isKnownRoot", stateMutability: "view", inputs: [{ name: "root", type: "bytes32" }], outputs: [{ type: "bool" }] },
];

function getDefaultRoot() {
  const tomlPath = path.resolve(__dirname, "..", "WithdrawProver.toml");
  if (!fs.existsSync(tomlPath)) return null;
  const content = fs.readFileSync(tomlPath, "utf8");
  const m = content.match(/expected_merkle_root\s*=\s*"([^"]+)"/);
  return m ? m[1].trim() : null;
}

async function main() {
  const RPC = process.env.MONAD_RPC;
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS ?? "0xD850AF48bDdf6E568A994a870aA684B86Bb5054f";
  let root = process.env.ROOT;

  if (!RPC || !PK) throw new Error("Set MONAD_RPC, PRIVATE_KEY");

  if (!root || !root.startsWith("0x") || root.length !== 66) {
    root = getDefaultRoot();
    if (root) console.log("Using expected_merkle_root from WithdrawProver.toml:", root);
  }
  if (!root || !root.startsWith("0x") || root.length !== 66) {
    throw new Error("Set ROOT (bytes32 hex) or run from repo root so WithdrawProver.toml is found");
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  const known = await pool.isKnownRoot(root);
  if (known) {
    console.log("Root already registered:", root);
    return;
  }

  const tx = await pool.registerRoot(root);
  console.log("registerRoot tx:", tx.hash);
  await tx.wait();
  console.log("Root registered ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
