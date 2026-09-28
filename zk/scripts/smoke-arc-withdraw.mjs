#!/usr/bin/env node
/**
 * Arc Testnet Standard withdraw smoke for the note deposited by smoke-arc-deposit.mjs.
 *
 * Usage (Node 20+, from zk/):
 *   set -a && source .env && set +a
 *   CIRCUITS_DIR="$(pwd)/circuits" npx --yes tsx scripts/smoke-arc-withdraw.mjs
 *
 * Defaults match deposit smoke PAYMENT_INDEX=0: pk_b=2, random=100, value=1e6.
 * Override DEPOSIT_TX / commitment via env if needed.
 */
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZK_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ZK_ROOT, "..");
const MAX_DEPTH = 10;

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ZK_ROOT, ".env"));

function resolveDeps() {
  const candidates = [
    path.join(ZK_ROOT, "circuits", "package.json"),
    path.join(REPO_ROOT, "web", "package.json"),
  ];
  for (const pkg of candidates) {
    if (!existsSync(pkg)) continue;
    try {
      const req = createRequire(pkg);
      return {
        ethers: req("ethers"),
        poseidon2Hash: req("poseidon-lite").poseidon2,
        from: pkg,
      };
    } catch {
      /* next */
    }
  }
  throw new Error("Could not load ethers / poseidon-lite");
}

function toBytes32(x) {
  const bi = typeof x === "bigint" ? x : BigInt(x);
  return "0x" + bi.toString(16).padStart(64, "0");
}

function poseidon2(hashFn, a, b) {
  return hashFn([a, b]);
}

async function fetchCommitments(ethers, provider, poolAddress, depositTx) {
  const pool = ethers.getAddress(poolAddress);
  const depTopic = ethers.id("Deposit(address,bytes32,uint256)");
  // Also support legacy 2-arg Deposit
  const depTopicLegacy = ethers.id("Deposit(address,bytes32)");

  const fromReceipt = async (txHash) => {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) throw new Error(`No receipt for ${txHash}`);
    const out = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== pool.toLowerCase()) continue;
      if (log.topics[0] !== depTopic && log.topics[0] !== depTopicLegacy) continue;
      out.push({
        commitment: BigInt(log.topics[2]),
        blockNumber: Number(receipt.blockNumber),
        txHash,
      });
    }
    return out;
  };

  // Prefer explicit deposit tx(es); also scan from ARC_DEPLOY_BLOCK if set
  const txHashes = (process.env.DEPOSIT_TXHASHES || depositTx)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let leaves = [];
  for (const h of txHashes) {
    leaves.push(...(await fromReceipt(h)));
  }

  // Full historical scan only when SCAN_DEPOSITS=1 (slow on Arc). Prefer DEPOSIT_TXHASHES.
  const fromBlock = BigInt(process.env.FROM_BLOCK || process.env.ARC_DEPLOY_BLOCK || "0");
  if (process.env.SCAN_DEPOSITS === "1" && fromBlock > 0n) {
    const latest = BigInt(await provider.getBlockNumber());
    const chunk = BigInt(process.env.CHUNK_SIZE || "2000");
    console.log(
      `[withdraw-smoke] scanning Deposit logs pool=%s from=%s to=%s`,
      pool,
      fromBlock.toString(),
      latest.toString(),
    );
    const scanned = [];
    for (let start = fromBlock; start <= latest; start += chunk) {
      const end = start + chunk - 1n > latest ? latest : start + chunk - 1n;
      const logs = await provider.getLogs({
        address: pool,
        topics: [[depTopic, depTopicLegacy]],
        fromBlock: start,
        toBlock: end,
      });
      for (const log of logs) {
        scanned.push({
          commitment: BigInt(log.topics[2]),
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
        });
      }
    }
    scanned.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? a.blockNumber - b.blockNumber
        : a.txHash.localeCompare(b.txHash),
    );
    // Deduplicate by commitment preserving order
    const seen = new Set();
    leaves = [];
    for (const row of scanned) {
      const key = row.commitment.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      leaves.push(row);
    }
  }

  if (leaves.length === 0) {
    throw new Error("No Deposit events found for pool");
  }
  return leaves;
}

async function merkleRootAndProof(poseidon2Hash, leafCommitments, leafIndex) {
  const size = 2 ** MAX_DEPTH;
  const padded = [...leafCommitments];
  while (padded.length < size) padded.push(0n);

  const siblings = [];
  const indices = [];
  let currentLevel = padded;
  let idx = leafIndex;

  for (let d = 0; d < MAX_DEPTH; d++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    siblings.push(currentLevel[siblingIdx]);
    indices.push(idx % 2);
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(poseidon2(poseidon2Hash, currentLevel[i], currentLevel[i + 1]));
    }
    currentLevel = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return { root: currentLevel[0], siblings, indices };
}

async function main() {
  const { ethers, poseidon2Hash, from: depsFrom } = resolveDeps();
  console.log("[withdraw-smoke] deps from", depsFrom);

  const RPC = process.env.ARC_RPC_TESTNET || process.env.ARC_RPC;
  const POOL = process.env.ARC_POOL_USDC_ADDRESS;
  const USDC = process.env.ARC_USDC_ADDRESS;
  const ROUTER = process.env.ARC_POOL_ROUTER_ADDRESS;
  const registrarPk = (
    process.env.ROOT_REGISTRAR_PRIVATE_KEY || ""
  ).trim();
  const withdrawPk = (
    process.env.B_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).trim();
  const depositTx =
    process.env.DEPOSIT_TX ||
    "0x924775cdcd104029089bdfd8007872995339aaed33e2ef8db0b6438da8e0907d";

  if (!RPC) throw new Error("Set ARC_RPC_TESTNET");
  if (!POOL) throw new Error("Set ARC_POOL_USDC_ADDRESS");
  if (!registrarPk) throw new Error("Set ROOT_REGISTRAR_PRIVATE_KEY");
  if (!withdrawPk) throw new Error("Set B_PRIVATE_KEY or PRIVATE_KEY");

  process.env.CIRCUITS_DIR =
    process.env.CIRCUITS_DIR || path.join(ZK_ROOT, "circuits");

  // Note secrets — match smoke-arc-deposit PAYMENT_INDEX=0 (verified on-chain)
  const paymentIndex = parseInt(process.env.PAYMENT_INDEX ?? "0", 10);
  const pk_b = paymentIndex % 2 === 0 ? 2n : 3n;
  const random = process.env.SMOKE_RANDOM
    ? BigInt(process.env.SMOKE_RANDOM)
    : 100n + BigInt(paymentIndex);
  const value = BigInt(process.env.AMOUNT ?? "1000000");
  const nullifier = poseidon2(poseidon2Hash, random, pk_b);
  const commitment = poseidon2(
    poseidon2Hash,
    poseidon2(poseidon2Hash, value, pk_b),
    poseidon2(poseidon2Hash, random, nullifier),
  );

  console.log("[withdraw-smoke] note pk_b=%s random=%s value=%s", pk_b, random, value);
  console.log("[withdraw-smoke] commitment", toBytes32(commitment));
  console.log("[withdraw-smoke] nullifier", toBytes32(nullifier));

  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  console.log("[withdraw-smoke] chainId", network.chainId.toString());

  const deposits = await fetchCommitments(ethers, provider, POOL, depositTx);
  console.log("[withdraw-smoke] deposits found:", deposits.length);
  deposits.forEach((d, i) =>
    console.log(
      `  [${i}] block=${d.blockNumber} c=${toBytes32(d.commitment)} tx=${d.txHash}`,
    ),
  );

  const leafCommitments = deposits.map((d) => d.commitment);
  const leafIndex = leafCommitments.findIndex((c) => c === commitment);
  if (leafIndex < 0) {
    throw new Error(
      `Computed commitment not in on-chain Deposit list. Check note secrets vs deposit tx.`,
    );
  }
  console.log("[withdraw-smoke] leafIndex", leafIndex);

  const { root, siblings, indices } = await merkleRootAndProof(
    poseidon2Hash,
    leafCommitments,
    leafIndex,
  );
  const rootHex = toBytes32(root);
  console.log("[withdraw-smoke] merkle root", rootHex);
  console.log("[withdraw-smoke] merkle_proof_length", siblings.length);

  const pool = new ethers.Contract(
    POOL,
    [
      "function registerRoot(bytes32 root)",
      "function isKnownRoot(bytes32 root) view returns (bool)",
      "function rootRegistrar() view returns (address)",
      "function withdraw(bytes proof, bytes32[] publicInputs)",
      "function nullifiers(bytes32) view returns (bool)",
    ],
    provider,
  );

  const registrarWallet = new ethers.Wallet(registrarPk, provider);
  const onChainRegistrar = await pool.rootRegistrar();
  console.log("[withdraw-smoke] rootRegistrar", onChainRegistrar);
  console.log("[withdraw-smoke] registrar wallet", registrarWallet.address);
  if (registrarWallet.address.toLowerCase() !== onChainRegistrar.toLowerCase()) {
    throw new Error(
      `ROOT_REGISTRAR_PRIVATE_KEY address ${registrarWallet.address} != pool.rootRegistrar ${onChainRegistrar}`,
    );
  }

  const known = await pool.isKnownRoot(rootHex);
  let registerTxHash = null;
  if (known) {
    console.log("[withdraw-smoke] root already registered");
  } else {
    const poolAsReg = pool.connect(registrarWallet);
    try {
      await poolAsReg.registerRoot.staticCall(rootHex);
    } catch (e) {
      console.error(
        "[withdraw-smoke] registerRoot staticCall failed:",
        e?.reason || e?.shortMessage || e?.message,
      );
      throw e;
    }
    const txR = await poolAsReg.registerRoot(rootHex);
    registerTxHash = txR.hash;
    console.log("[withdraw-smoke] registerRoot tx:", registerTxHash);
    await txR.wait();
    console.log("[withdraw-smoke] root registered");
  }

  const withdrawWallet = new ethers.Wallet(withdrawPk, provider);
  const recipient = withdrawWallet.address;
  console.log("[withdraw-smoke] withdraw sender/recipient", recipient);

  if (await pool.nullifiers(toBytes32(nullifier))) {
    throw new Error("Nullifier already spent");
  }

  const withdrawInputs = {
    value: toBytes32(value),
    nullifier: toBytes32(nullifier),
    merkle_proof_length: siblings.length,
    expected_merkle_root: rootHex,
    recipient: toBytes32(BigInt(recipient)),
    pk_b: toBytes32(pk_b),
    random: toBytes32(random),
    merkle_proof_indices: indices,
    merkle_proof_siblings: siblings.map((s) => toBytes32(s)),
  };

  console.log("[withdraw-smoke] generating withdraw proof…");
  const withdrawProverPath = path.join(
    REPO_ROOT,
    "web",
    "app",
    "lib",
    "withdrawProver.ts",
  );
  let proofHex;
  try {
    const { generateWithdrawProof } = await import(withdrawProverPath);
    const proved = await generateWithdrawProof(withdrawInputs);
    proofHex = proved.proofHex;
  } catch (err) {
    console.error("[withdraw-smoke] PROVE FAILED:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 2;
    return;
  }
  console.log("[withdraw-smoke] proof bytes", (proofHex.length - 2) / 2);

  const publicInputs = [
    toBytes32(value),
    toBytes32(nullifier),
    toBytes32(BigInt(siblings.length)),
    rootHex,
    toBytes32(BigInt(recipient)),
  ];

  let withdrawTxHash;
  const useRouter = process.env.USE_ROUTER !== "0" && Boolean(ROUTER);
  if (useRouter) {
    const router = new ethers.Contract(
      ROUTER,
      [
        "function withdraw(address token, bytes proof, bytes32[] publicInputs, bool unwrap)",
      ],
      withdrawWallet,
    );
    try {
      await router.withdraw.staticCall(USDC, proofHex, publicInputs, false);
    } catch (e) {
      console.error(
        "[withdraw-smoke] router.withdraw staticCall failed:",
        e?.reason || e?.shortMessage || e?.message,
      );
      throw e;
    }
    const txW = await router.withdraw(USDC, proofHex, publicInputs, false);
    withdrawTxHash = txW.hash;
    console.log("[withdraw-smoke] router.withdraw tx:", withdrawTxHash);
    await txW.wait();
  } else {
    const poolW = pool.connect(withdrawWallet);
    try {
      await poolW.withdraw.staticCall(proofHex, publicInputs);
    } catch (e) {
      console.error(
        "[withdraw-smoke] pool.withdraw staticCall failed:",
        e?.reason || e?.shortMessage || e?.message,
      );
      throw e;
    }
    const txW = await poolW.withdraw(proofHex, publicInputs);
    withdrawTxHash = txW.hash;
    console.log("[withdraw-smoke] pool.withdraw tx:", withdrawTxHash);
    await txW.wait();
  }

  console.log("SUCCESS");
  console.log(
    JSON.stringify(
      {
        success: true,
        depositTx,
        registerTxHash,
        withdrawTxHash,
        commitment: toBytes32(commitment),
        nullifier: toBytes32(nullifier),
        root: rootHex,
        leafIndex,
        recipient,
        amount: value.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("[withdraw-smoke] FAILURE:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
