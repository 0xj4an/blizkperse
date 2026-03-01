/**
 * Registers the withdraw circuit's expected_merkle_root in the ShieldedPool.
 * Without this root, withdraw() will revert with "unknown root".
 *
 * Requires: MONAD_RPC, PRIVATE_KEY (POOL_ADDRESS optional; defaults to deployed pool)
 * Optional: ROOT=0x... (if not provided, reads expected_merkle_root from WithdrawProver.toml)
 *
 * Usage:
 *   node circuits/scripts/register_root.mjs
 *   node scripts/register_root.mjs   # from repo root (runner)
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
  const POOL = process.env.POOL_ADDRESS ?? "0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c";
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

  let code;
  try {
    code = await provider.getCode(POOL);
  } catch (e) {
    if (e.code === "TIMEOUT" || e.shortMessage?.includes("timeout") || e.message?.includes("detect network")) {
      throw new Error(
        "Could not connect to RPC. Check MONAD_RPC in .env:\n" +
        "  - Is the URL correct? (e.g. Monad: https://rpc3.monad.xyz)\n" +
        "  - Do you have internet / is the network available?\n" +
        "  - Test in another terminal: curl -s -X POST -H 'Content-Type: application/json' --data '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}' " + RPC
      );
    }
    throw e;
  }

  if (!code || code === "0x") {
    throw new Error(
      `No contract at POOL_ADDRESS ${POOL} on this network. ` +
      "Did you deploy the pool? Set POOL_ADDRESS in .env to your ShieldedPool address and MONAD_RPC to the correct chain."
    );
  }

  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  let known;
  try {
    known = await pool.isKnownRoot(root);
  } catch (e) {
    if (e.info?.method === "isKnownRoot" && (e.value === "0x" || e.code === "BAD_DATA")) {
      throw new Error(
        `Contract at ${POOL} did not return valid data (isKnownRoot). ` +
        "Check that POOL_ADDRESS is your ShieldedPool, not another contract, and that you are on the right network (MONAD_RPC)."
      );
    }
    throw e;
  }

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
