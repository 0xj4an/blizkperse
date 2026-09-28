#!/usr/bin/env node
/**
 * Arc Testnet Private E2E: depositBatch (1 bucket note) → registerRoot → withdrawDenom.
 *
 * Usage (Node 20+, from zk/):
 *   set -a && source .env && set +a
 *   CIRCUITS_DIR="$(pwd)/circuits" npx --yes tsx scripts/smoke-arc-private.mjs
 *
 * Defaults: denomination_id=10 (10 USDC), unique random each run.
 * Env: ARC_RPC_TESTNET, PRIVATE_KEY, ROOT_REGISTRAR_PRIVATE_KEY, B_PRIVATE_KEY (optional),
 *      ARC_USDC_ADDRESS, ARC_POOL_USDC_ADDRESS, ARC_POOL_ROUTER_ADDRESS,
 *      DENOM_ID (default 10), SMOKE_RANDOM (optional).
 */
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZK_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ZK_ROOT, "..");
const MAX_DEPTH = 10;

/** Stables6 ladder (human * 1e6) — must match withdraw_denom.nr + on-chain setDenominations. */
const STABLES6 = [
  50_000_000n,
  100_000_000n,
  250_000_000n,
  500_000_000n,
  1_000_000_000n,
  2_500_000_000n,
  5_000_000_000n,
  10_000_000_000n,
  25_000_000_000n,
  50_000_000_000n,
  10_000_000n, // id 10
];

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

async function fetchAllLeaves(ethers, provider, poolAddress) {
  const pool = ethers.getAddress(poolAddress);
  const depTopic = ethers.id("Deposit(address,bytes32,uint256)");
  const depTopicLegacy = ethers.id("Deposit(address,bytes32)");
  const insertTopic = ethers.id("CommitmentInserted(bytes32,uint256)");

  const fromBlock = BigInt(
    process.env.FROM_BLOCK || process.env.ARC_DEPLOY_BLOCK || "64165590",
  );
  const latest = BigInt(await provider.getBlockNumber());
  const chunk = BigInt(process.env.CHUNK_SIZE || "5000");
  console.log(
    `[private-smoke] scanning leaves pool=%s from=%s to=%s`,
    pool,
    fromBlock.toString(),
    latest.toString(),
  );

  const rows = [];
  for (let start = fromBlock; start <= latest; start += chunk) {
    const end = start + chunk - 1n > latest ? latest : start + chunk - 1n;
    const logs = await provider.getLogs({
      address: pool,
      topics: [[depTopic, depTopicLegacy, insertTopic]],
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      let commitment;
      if (log.topics[0] === insertTopic) {
        commitment = BigInt(log.topics[1]);
      } else {
        commitment = BigInt(log.topics[2]);
      }
      rows.push({
        commitment,
        blockNumber: Number(log.blockNumber),
        logIndex: Number(log.index),
        txHash: log.transactionHash,
        kind: log.topics[0] === insertTopic ? "insert" : "deposit",
      });
    }
  }

  rows.sort((a, b) =>
    a.blockNumber !== b.blockNumber
      ? a.blockNumber - b.blockNumber
      : a.logIndex - b.logIndex,
  );

  const seen = new Set();
  const leaves = [];
  for (const row of rows) {
    const key = row.commitment.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    leaves.push(row);
  }
  return leaves;
}

function merkleRootAndProof(poseidon2Hash, leafCommitments, leafIndex) {
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
      nextLevel.push(
        poseidon2(poseidon2Hash, currentLevel[i], currentLevel[i + 1]),
      );
    }
    currentLevel = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return { root: currentLevel[0], siblings, indices };
}

async function main() {
  const { ethers, poseidon2Hash, from: depsFrom } = resolveDeps();
  console.log("[private-smoke] deps from", depsFrom);

  const RPC = process.env.ARC_RPC_TESTNET || process.env.ARC_RPC;
  const PK = (process.env.PRIVATE_KEY || "").trim();
  const registrarPk = (process.env.ROOT_REGISTRAR_PRIVATE_KEY || "").trim();
  const withdrawPk = (
    process.env.B_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).trim();
  const USDC = process.env.ARC_USDC_ADDRESS;
  const POOL = process.env.ARC_POOL_USDC_ADDRESS;
  const ROUTER = process.env.ARC_POOL_ROUTER_ADDRESS;

  if (!RPC) throw new Error("Set ARC_RPC_TESTNET");
  if (!PK) throw new Error("Set PRIVATE_KEY");
  if (!registrarPk) throw new Error("Set ROOT_REGISTRAR_PRIVATE_KEY");
  if (!USDC || !POOL || !ROUTER) {
    throw new Error("Set ARC_USDC_ADDRESS, ARC_POOL_USDC_ADDRESS, ARC_POOL_ROUTER_ADDRESS");
  }

  process.env.CIRCUITS_DIR =
    process.env.CIRCUITS_DIR || path.join(ZK_ROOT, "circuits");
  console.log("[private-smoke] CIRCUITS_DIR=", process.env.CIRCUITS_DIR);

  const denomId = parseInt(process.env.DENOM_ID ?? "10", 10);
  if (denomId < 0 || denomId >= STABLES6.length) {
    throw new Error(`DENOM_ID must be 0..${STABLES6.length - 1}`);
  }
  const amount = STABLES6[denomId];
  const pk_b = 2n;
  const random = process.env.SMOKE_RANDOM
    ? BigInt(process.env.SMOKE_RANDOM)
    : BigInt(Date.now());

  const nullifier = poseidon2(poseidon2Hash, random, pk_b);
  const commitment = poseidon2(
    poseidon2Hash,
    poseidon2(poseidon2Hash, amount, pk_b),
    poseidon2(poseidon2Hash, random, nullifier),
  );
  const commitmentHex = toBytes32(commitment);
  const nullifierHex = toBytes32(nullifier);
  const valueHex = toBytes32(amount);

  console.log(
    "[private-smoke] note denomId=%s amount=%s pk_b=%s random=%s",
    denomId,
    amount.toString(),
    pk_b.toString(),
    random.toString(),
  );
  console.log("[private-smoke] commitment", commitmentHex);
  console.log("[private-smoke] nullifier", nullifierHex);

  // ── Deposit proof ──
  console.log("[private-smoke] generating deposit proof…");
  const depositProverPath = path.join(
    REPO_ROOT,
    "web",
    "app",
    "lib",
    "depositProver.ts",
  );
  const { generateDepositProof } = await import(depositProverPath);
  const depositProved = await generateDepositProof({
    value: valueHex,
    commitment: commitmentHex,
    pk_b: toBytes32(pk_b),
    random: toBytes32(random),
    nullifier: nullifierHex,
  });
  const depositProof = depositProved.proofHex;
  const depositPIs = depositProved.publicInputs.map((x) => toBytes32(BigInt(x)));
  console.log(
    "[private-smoke] deposit proof bytes=%s",
    (depositProof.length - 2) / 2,
  );

  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  console.log("[private-smoke] chainId", network.chainId.toString());

  const depositor = new ethers.Wallet(PK, provider);
  console.log("[private-smoke] depositor", depositor.address);

  const token = new ethers.Contract(
    USDC,
    [
      "function approve(address,uint256) returns (bool)",
      "function allowance(address,address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
    ],
    depositor,
  );
  const pool = new ethers.Contract(
    POOL,
    [
      "function usedCommitments(bytes32) view returns (bool)",
      "function denominationCount() view returns (uint256)",
      "function denominations(uint256) view returns (uint256)",
      "function withdrawDenomVerifier() view returns (address)",
      "function privateDepositAllowlistEnabled() view returns (bool)",
      "function privateDepositAllowed(address) view returns (bool)",
      "function registerRoot(bytes32)",
      "function isKnownRoot(bytes32) view returns (bool)",
      "function rootRegistrar() view returns (address)",
      "function nullifiers(bytes32) view returns (bool)",
      "function depositBatch(bytes32[],uint256[],bytes[],bytes32[][])",
      "function withdrawDenom(bytes,bytes32[])",
    ],
    provider,
  );
  const router = new ethers.Contract(
    ROUTER,
    [
      "function feeBps() view returns (uint256)",
      "function quoteFee(uint256) view returns (uint256)",
      "function quoteGross(uint256) view returns (uint256)",
      "function poolOf(address) view returns (address)",
      "function depositBatch(address,bytes32[],uint256[],bytes[],bytes32[][])",
      "function withdrawDenom(address,bytes,bytes32[],bool)",
    ],
    depositor,
  );

  const mapped = await router.poolOf(USDC);
  if (mapped.toLowerCase() !== POOL.toLowerCase()) {
    throw new Error(`router.poolOf mismatch: ${mapped} vs ${POOL}`);
  }

  const denomCount = await pool.denominationCount();
  const onChainAmount = await pool.denominations(denomId);
  const denomVerifier = await pool.withdrawDenomVerifier();
  console.log(
    "[private-smoke] denomCount=%s onChainAmount[%s]=%s withdrawDenomVerifier=%s",
    denomCount.toString(),
    denomId,
    onChainAmount.toString(),
    denomVerifier,
  );
  if (denomCount === 0n) throw new Error("Pool denominations unset");
  if (onChainAmount !== amount) {
    throw new Error(
      `On-chain denominations[${denomId}]=${onChainAmount} != expected ${amount}`,
    );
  }
  if (denomVerifier === ethers.ZeroAddress) {
    throw new Error("withdrawDenomVerifier unset on pool");
  }

  const allowlistOn = await pool.privateDepositAllowlistEnabled();
  if (allowlistOn) {
    const allowed = await pool.privateDepositAllowed(depositor.address);
    if (!allowed) {
      throw new Error(
        `privateDepositAllowlistEnabled but ${depositor.address} not allowed`,
      );
    }
  }

  if (await pool.usedCommitments(commitmentHex)) {
    throw new Error("Commitment already used — set a new SMOKE_RANDOM");
  }

  const fee = await router.quoteFee(amount);
  const gross = await router.quoteGross(amount);
  console.log(
    "[private-smoke] fee=%s gross=%s",
    fee.toString(),
    gross.toString(),
  );

  const bal = await token.balanceOf(depositor.address);
  if (bal < gross) {
    throw new Error(`Insufficient USDC: have ${bal}, need ${gross}`);
  }

  const allowance = await token.allowance(depositor.address, ROUTER);
  if (allowance < gross) {
    console.log("[private-smoke] approving router…");
    const txA = await token.approve(ROUTER, gross);
    console.log("[private-smoke] approve tx", txA.hash);
    await txA.wait();
  }

  const commitments = [commitmentHex];
  const denominationIds = [BigInt(denomId)];
  const proofs = [depositProof];
  const publicInputsArr = [depositPIs];

  try {
    await router.depositBatch.staticCall(
      USDC,
      commitments,
      denominationIds,
      proofs,
      publicInputsArr,
    );
  } catch (e) {
    console.error(
      "[private-smoke] depositBatch staticCall failed:",
      e?.reason || e?.shortMessage || e?.message,
    );
    throw e;
  }

  const txBatch = await router.depositBatch(
    USDC,
    commitments,
    denominationIds,
    proofs,
    publicInputsArr,
  );
  console.log("[private-smoke] depositBatch tx", txBatch.hash);
  const batchReceipt = await txBatch.wait();
  console.log(
    "[private-smoke] depositBatch confirmed status=%s block=%s",
    batchReceipt.status,
    batchReceipt.blockNumber,
  );

  // ── Merkle + registerRoot ──
  const leaves = await fetchAllLeaves(ethers, provider, POOL);
  console.log("[private-smoke] total leaves", leaves.length);
  const leafCommitments = leaves.map((l) => l.commitment);
  const leafIndex = leafCommitments.findIndex((c) => c === commitment);
  if (leafIndex < 0) {
    throw new Error("New commitment not found in leaf scan after depositBatch");
  }
  console.log("[private-smoke] leafIndex", leafIndex);

  const { root, siblings, indices } = merkleRootAndProof(
    poseidon2Hash,
    leafCommitments,
    leafIndex,
  );
  const rootHex = toBytes32(root);
  console.log("[private-smoke] root", rootHex);

  const registrarWallet = new ethers.Wallet(registrarPk, provider);
  const onChainRegistrar = await pool.rootRegistrar();
  if (registrarWallet.address.toLowerCase() !== onChainRegistrar.toLowerCase()) {
    throw new Error(
      `ROOT_REGISTRAR_PRIVATE_KEY ${registrarWallet.address} != ${onChainRegistrar}`,
    );
  }

  let registerTxHash = null;
  if (await pool.isKnownRoot(rootHex)) {
    console.log("[private-smoke] root already registered");
  } else {
    const poolAsReg = pool.connect(registrarWallet);
    const txR = await poolAsReg.registerRoot(rootHex);
    registerTxHash = txR.hash;
    console.log("[private-smoke] registerRoot tx", registerTxHash);
    await txR.wait();
  }

  // ── withdrawDenom proof + submit ──
  const withdrawWallet = new ethers.Wallet(withdrawPk, provider);
  // Fund B gas if needed (Arc native = USDC 18dp)
  const bNative = await provider.getBalance(withdrawWallet.address);
  if (bNative < 10n ** 15n) {
    console.log("[private-smoke] funding B native gas…");
    const fundTx = await depositor.sendTransaction({
      to: withdrawWallet.address,
      value: 10n ** 16n, // 0.01 USDC native
    });
    console.log("[private-smoke] fund tx", fundTx.hash);
    await fundTx.wait();
  }

  const recipient = withdrawWallet.address;
  console.log("[private-smoke] withdraw recipient", recipient);

  if (await pool.nullifiers(nullifierHex)) {
    throw new Error("Nullifier already spent");
  }

  const denomInputs = {
    denomination_id: denomId,
    nullifier: nullifierHex,
    merkle_proof_length: siblings.length,
    expected_merkle_root: rootHex,
    recipient: toBytes32(BigInt(recipient)),
    value: valueHex,
    pk_b: toBytes32(pk_b),
    random: toBytes32(random),
    merkle_proof_indices: indices,
    merkle_proof_siblings: siblings.map((s) => toBytes32(s)),
  };

  console.log("[private-smoke] generating withdrawDenom proof…");
  const denomProverPath = path.join(
    REPO_ROOT,
    "web",
    "app",
    "lib",
    "withdrawDenomProver.ts",
  );
  const { generateWithdrawDenomProof } = await import(denomProverPath);
  const { proofHex: withdrawProof } =
    await generateWithdrawDenomProof(denomInputs);
  console.log(
    "[private-smoke] withdrawDenom proof bytes",
    (withdrawProof.length - 2) / 2,
  );

  const withdrawPIs = [
    toBytes32(BigInt(denomId)),
    nullifierHex,
    toBytes32(BigInt(siblings.length)),
    rootHex,
    toBytes32(BigInt(recipient)),
  ];

  const routerAsB = router.connect(withdrawWallet);
  try {
    await routerAsB.withdrawDenom.staticCall(
      USDC,
      withdrawProof,
      withdrawPIs,
      false,
    );
  } catch (e) {
    console.error(
      "[private-smoke] withdrawDenom staticCall failed:",
      e?.reason || e?.shortMessage || e?.message,
    );
    throw e;
  }

  const txW = await routerAsB.withdrawDenom(
    USDC,
    withdrawProof,
    withdrawPIs,
    false,
  );
  console.log("[private-smoke] withdrawDenom tx", txW.hash);
  await txW.wait();

  console.log("SUCCESS");
  console.log(
    JSON.stringify(
      {
        success: true,
        mode: "private",
        denominationId: denomId,
        amount: amount.toString(),
        depositBatchTx: txBatch.hash,
        registerTxHash,
        withdrawDenomTx: txW.hash,
        commitment: commitmentHex,
        nullifier: nullifierHex,
        root: rootHex,
        leafIndex,
        recipient,
        random: random.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("[private-smoke] FAILURE:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
