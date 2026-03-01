#!/usr/bin/env node
/**
 * Fetches the list of commitments from ShieldedPool Deposit events (in order)
 * and calculates the Merkle root using the same logic as the circuit (Poseidon2, depth 10).
 *
 * Usage (from zk/circuits/):
 *   MONAD_RPC=https://rpc3.monad.xyz node scripts/commitments_and_root_from_chain.mjs
 *
 * Optional: POOL_ADDRESS, FROM_BLOCK, TO_BLOCK (default: latest),
 *          CHUNK_SIZE, CHUNK_DELAY_MS, RATE_LIMIT_RETRY_MS.
 *
 * Alternative 1 (by blocks): DEPOSIT_BLOCKS=56234450,56234500,56234800
 * Alternative 2 (by tx hash, more reliable): pass tx hashes of each deposit, uses getTransactionReceipt:
 *   DEPOSIT_TXHASHES=0xb88a...,0xdbaa...,0x9d16... node scripts/commitments_and_root_from_chain.mjs
 *
 * If you have zk/.env with MONAD_RPC (e.g. Infura), the script loads it automatically.
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { Barretenberg, Fr } from "@aztec/bb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env"), override: true });

const POOL_DEFAULT = "0x085BD9c0C568BE5093130E2359B00e46cb0800d1";
const DEPLOY_BLOCK_MONAD = 56_234_450;

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "100", 10);
const CHUNK_DELAY_MS = parseInt(process.env.CHUNK_DELAY_MS || "800", 10);
const RATE_LIMIT_RETRY_MS = parseInt(process.env.RATE_LIMIT_RETRY_MS || "12000", 10);
const MAX_DEPTH = 10;

const POOL_ABI = [
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
];

function toBigInt(frOrBytes) {
  if (typeof frOrBytes === "bigint") return frOrBytes;
  if (frOrBytes instanceof Fr) return BigInt(frOrBytes.toString());
  throw new Error("Unexpected type");
}

function toHex64(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}

function isRateLimitError(e) {
  const msg = (e.message || e.shortMessage || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many requests") || (e.error && String(e.error.message || "").toLowerCase().includes("rate limit"));
}

async function getLogsWithRetry(provider, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await provider.getLogs(params);
    } catch (e) {
      if (isRateLimitError(e) && attempt < maxRetries) {
        console.warn(`Rate limit (intento ${attempt}/${maxRetries}). Esperando ${RATE_LIMIT_RETRY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
      } else {
        throw e;
      }
    }
  }
}

async function fetchDepositLogs(provider, poolAddress, fromBlock, toBlock) {
  const current = toBlock === "latest" ? BigInt(await provider.getBlockNumber()) : toBlock;
  const iface = new ethers.Interface(POOL_ABI);
  const depositTopic = iface.getEvent("Deposit").topicHash;
  const address = ethers.getAddress(poolAddress);
  const allLogs = [];
  const totalChunks = Number((current - fromBlock) / BigInt(CHUNK_SIZE)) + 1;
  let done = 0;

  for (let start = fromBlock; start <= current; start += BigInt(CHUNK_SIZE)) {
    const end = start + BigInt(CHUNK_SIZE) - 1n > current ? current : start + BigInt(CHUNK_SIZE) - 1n;
    const logs = await getLogsWithRetry(provider, {
      address,
      topics: [depositTopic],
      fromBlock: "0x" + start.toString(16),
      toBlock: "0x" + end.toString(16),
    });
    allLogs.push(...logs);
    done++;
    if (done % 50 === 0) console.warn(`  Chunks: ${done}/${totalChunks}`);
    if (start + BigInt(CHUNK_SIZE) <= current) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
  }

  allLogs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.index - b.index;
  });

  return allLogs.map((log) => {
    const commitment = log.topics[2];
    return { blockNumber: log.blockNumber, commitment: BigInt(commitment) };
  });
}

/** Only queries the specified blocks (one request per block). Ideal if you already know where deposits occurred. */
async function fetchDepositLogsByBlocks(provider, poolAddress, blockNumbers) {
  const iface = new ethers.Interface(POOL_ABI);
  const depositTopic = iface.getEvent("Deposit").topicHash;
  const address = ethers.getAddress(poolAddress);
  const uniqueBlocks = [...new Set(blockNumbers.map((b) => BigInt(b)))].sort((a, b) => Number(a - b));
  const allLogs = [];
  for (let i = 0; i < uniqueBlocks.length; i++) {
    const block = uniqueBlocks[i];
    const params = {
      address,
      topics: [depositTopic],
      fromBlock: "0x" + block.toString(16),
      toBlock: "0x" + block.toString(16),
    };
    const logs = await getLogsWithRetry(provider, params);
    allLogs.push(...logs);
    if (i < uniqueBlocks.length - 1) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
  }
  if (allLogs.length === 0 && uniqueBlocks.length > 0) {
    const firstBlock = uniqueBlocks[0];
    const anyDeposit = await provider.getLogs({
      topics: [depositTopic],
      fromBlock: "0x" + firstBlock.toString(16),
      toBlock: "0x" + firstBlock.toString(16),
    });
    if (anyDeposit.length > 0) {
      const contracts = [...new Set(anyDeposit.map((l) => l.address))];
      console.warn("");
      console.warn("Diagnostic: block " + firstBlock + " has " + anyDeposit.length + " Deposit event(s), but from other contract(s):");
      contracts.forEach((c) => console.warn("  -", c));
      console.warn("Pool you are using:", address);
      console.warn("Verify that POOL_ADDRESS is the correct contract (e.g. check the block explorer URL).");
    } else {
      console.warn("");
      console.warn("Diagnostic: block " + firstBlock + " returned no logs with the Deposit(address,bytes32) signature from the RPC.");
      console.warn("The RPC may be outdated or on a different network. Try a different MONAD_RPC (e.g. Infura).");
    }
  }
  allLogs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.index - b.index;
  });
  return allLogs.map((log) => {
    const commitment = log.topics[2];
    return { blockNumber: log.blockNumber, commitment: BigInt(commitment) };
  });
}

/** Fetches Deposits by tx hash using getTransactionReceipt (does not depend on getLogs by block). */
async function fetchDepositLogsByTxHashes(provider, poolAddress, txHashes) {
  const iface = new ethers.Interface(POOL_ABI);
  const depositTopic = iface.getEvent("Deposit").topicHash;
  const address = ethers.getAddress(poolAddress);
  const allLogs = [];
  for (let i = 0; i < txHashes.length; i++) {
    const txHash = txHashes[i].trim();
    if (!txHash) continue;
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.warn("Warning: receipt not found for tx", txHash);
      continue;
    }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== address.toLowerCase()) continue;
      if (log.topics[0] !== depositTopic) continue;
      allLogs.push(log);
    }
    if (i < txHashes.length - 1) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
  }
  allLogs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.index - b.index;
  });
  return allLogs.map((log) => {
    const commitment = log.topics[2];
    return { blockNumber: log.blockNumber, commitment: BigInt(commitment) };
  });
}

async function buildMerkleRootAndProofs(bb, leaves) {
  const poseidon2 = async (a, b) => {
    const out = await bb.poseidon2Hash([new Fr(a), new Fr(b)]);
    return toBigInt(out);
  };

  const depth = MAX_DEPTH;
  const size = 2 ** depth;
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < size) paddedLeaves.push(0n);

  let currentLevel = paddedLeaves;
  for (let d = 0; d < depth; d++) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(await poseidon2(currentLevel[i], currentLevel[i + 1]));
    }
    currentLevel = nextLevel;
  }
  const root = currentLevel[0];

  async function getProof(leafIndex) {
    const siblings = [];
    const indices = [];
    let level = paddedLeaves;
    let idx = leafIndex;

    for (let d = 0; d < depth; d++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      siblings.push(level[siblingIdx]);
      indices.push(idx % 2);

      const nextLevel = [];
      for (let i = 0; i < level.length; i += 2) {
        nextLevel.push(await poseidon2(level[i], level[i + 1]));
      }
      level = nextLevel;
      idx = Math.floor(idx / 2);
    }
    return { siblings, indices, root: level[0] };
  }

  const proofs = [];
  for (let i = 0; i < leaves.length; i++) {
    proofs.push(await getProof(i));
  }

  return { root, proofs };
}

async function main() {
  const RPC = process.env.MONAD_RPC || "https://monad-mainnet.infura.io/v3/cb9fe8d557544ded9e0b960d3a1b6852";
  const POOL = process.env.POOL_ADDRESS || POOL_DEFAULT;
  const depositTxHashesEnv = process.env.DEPOSIT_TXHASHES?.trim();
  const depositTxHashes = depositTxHashesEnv
    ? depositTxHashesEnv.split(",").map((s) => s.trim()).filter((s) => s.length >= 64)
    : null;
  const depositBlocksEnv = process.env.DEPOSIT_BLOCKS?.trim();
  const depositBlocks = depositBlocksEnv
    ? depositBlocksEnv.split(",").map((s) => s.trim()).filter(Boolean).map((s) => parseInt(s, 10))
    : null;
  const fromBlock = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : BigInt(DEPLOY_BLOCK_MONAD);
  const toBlock = process.env.TO_BLOCK ? (process.env.TO_BLOCK === "latest" ? "latest" : BigInt(process.env.TO_BLOCK)) : "latest";

  const provider = new ethers.JsonRpcProvider(RPC);

  console.log("Pool:", POOL);
  console.log("RPC:", RPC);
  if (depositTxHashes?.length) {
    console.log("Modo: DEPOSIT_TXHASHES (" + depositTxHashes.length + " tx)");
  } else if (depositBlocks?.length) {
    console.log("Bloques: solo los indicados en DEPOSIT_BLOCKS:", depositBlocks.join(", "));
  } else {
    console.log("Bloques: from", fromBlock.toString(), "to", toBlock === "latest" ? "latest" : toBlock.toString());
  }
  console.log("");

  let deposits;
  if (depositTxHashes?.length) {
    deposits = await fetchDepositLogsByTxHashes(provider, POOL, depositTxHashes);
  } else if (depositBlocks?.length) {
    deposits = await fetchDepositLogsByBlocks(provider, POOL, depositBlocks);
  } else {
    deposits = await fetchDepositLogs(provider, POOL, fromBlock, toBlock);
  }
  const commitments = deposits.map((d) => d.commitment);

  console.log("Deposits found:", commitments.length);
  if (commitments.length === 0) {
    console.log("No commitments found. Adjust FROM_BLOCK/TO_BLOCK or verify that deposits were made.");
    process.exit(0);
    return;
  }

  console.log("");
  console.log("--- Commitments (chronological order) ---");
  commitments.forEach((c, i) => {
    console.log(`${i + 1}. ${toHex64(c)}  (block ${deposits[i].blockNumber})`);
  });

  console.log("");
  console.log("Computing Merkle root (Poseidon2, depth 10)...");
  const bb = await Barretenberg.new();
  const { root, proofs } = await buildMerkleRootAndProofs(bb, commitments);
  await bb.destroy();

  console.log("");
  console.log("--- Computed Merkle root ---");
  console.log(toHex64(root));
  console.log("");
  console.log("(If this root is registered in the pool, you can use it as expected_merkle_root in WithdrawProver.toml)");
  console.log("");

  const proofDepth = MAX_DEPTH;
  console.log("--- Merkle path por hoja (para WithdrawProver.toml) ---");
  console.log("merkle_proof_length =", proofDepth);
  for (let i = 0; i < proofs.length; i++) {
    const p = proofs[i];
    const indicesStr = "[" + p.indices.map((x) => x).join(",") + "]";
    const siblingsStr = "[" + p.siblings.map((s) => '"' + toHex64(s) + '"').join(",") + "]";
    console.log("");
    console.log(`Hoja ${i} (commitment ${toHex64(commitments[i])}):`);
    console.log("  merkle_proof_indices =", indicesStr);
    console.log("  merkle_proof_siblings =", siblingsStr);
  }

  console.log("");
  console.log("Para registrar este root en la pool:");
  console.log("  ROOT=" + toHex64(root) + " node scripts/register_root.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
