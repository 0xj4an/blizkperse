#!/usr/bin/env node
/**
 * Arc Testnet Standard-mode USDC deposit smoke (ZK deposit proof).
 *
 * Usage (from zk/):
 *   set -a && source .env && set +a
 *   CIRCUITS_DIR="$(pwd)/circuits" npx --yes tsx scripts/smoke-arc-deposit.mjs
 *
 * Env: ARC_RPC_TESTNET, PRIVATE_KEY, ARC_USDC_ADDRESS, ARC_POOL_USDC_ADDRESS,
 *      ARC_POOL_ROUTER_ADDRESS (preferred). Optional: PAYMENT_INDEX, AMOUNT, FEE_BPS.
 */
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZK_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ZK_ROOT, "..");

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
    // Strip inline comments after unquoted values
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
      const ethers = req("ethers");
      const { poseidon2 } = req("poseidon-lite");
      return { ethers, poseidon2, from: pkg };
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Could not load ethers / poseidon-lite from circuits or web node_modules",
  );
}

function toBytes32(x) {
  const bi = typeof x === "bigint" ? x : BigInt(x);
  return "0x" + bi.toString(16).padStart(64, "0");
}

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ROUTER_ABI = [
  "function deposit(address token, bytes32 commitment, uint256 amount, bytes proof, bytes32[] publicInputs)",
  "function feeBps() view returns (uint256)",
  "function quoteFee(uint256 amount) view returns (uint256)",
  "function quoteGross(uint256 amount) view returns (uint256)",
  "function poolOf(address token) view returns (address)",
];

const POOL_ABI = [
  "function deposit(bytes32 commitment, uint256 amount, bytes proof, bytes32[] publicInputs)",
  "function usedCommitments(bytes32) view returns (bool)",
  "function rootRegistrar() view returns (address)",
  "function token() view returns (address)",
  "function usdc() view returns (address)",
];

async function main() {
  const { ethers, poseidon2: poseidon2Hash, from: depsFrom } = resolveDeps();
  console.log("[smoke] deps from", depsFrom);

  const RPC = process.env.ARC_RPC_TESTNET || process.env.ARC_RPC;
  const PK = process.env.PRIVATE_KEY;
  const USDC = process.env.ARC_USDC_ADDRESS;
  const POOL = process.env.ARC_POOL_USDC_ADDRESS;
  const ROUTER = process.env.ARC_POOL_ROUTER_ADDRESS || process.env.POOL_ROUTER_ADDRESS;
  const paymentIndex = parseInt(process.env.PAYMENT_INDEX ?? "0", 10);
  const amount = BigInt(process.env.AMOUNT ?? "1000000"); // 1 USDC raw

  if (!RPC) throw new Error("Set ARC_RPC_TESTNET");
  if (!PK) throw new Error("Set PRIVATE_KEY");
  if (!USDC) throw new Error("Set ARC_USDC_ADDRESS");
  if (!POOL) throw new Error("Set ARC_POOL_USDC_ADDRESS");

  process.env.CIRCUITS_DIR =
    process.env.CIRCUITS_DIR || path.join(ZK_ROOT, "circuits");
  console.log("[smoke] CIRCUITS_DIR=", process.env.CIRCUITS_DIR);

  // Note secrets (Standard path): value = raw token amount
  const B = 2n;
  const C = 3n;
  const RECIPIENTS = [B, C, B, C, B];
  if (paymentIndex < 0 || paymentIndex >= RECIPIENTS.length) {
    throw new Error(`PAYMENT_INDEX must be 0..${RECIPIENTS.length - 1}`);
  }
  const pk_b = RECIPIENTS[paymentIndex];
  const random = process.env.SMOKE_RANDOM
    ? BigInt(process.env.SMOKE_RANDOM)
    : 100n + BigInt(paymentIndex);
  const value = amount;

  console.log("[smoke] computing note: pk_b=%s random=%s value=%s", pk_b, random, value);
  // poseidon-lite matches circuit poseidon::bn254::hash_2 / web lib/zk.ts
  function poseidon2(a, b) {
    return poseidon2Hash([a, b]);
  }
  function compute_entry(v, holder, rnd, nullifier) {
    return poseidon2(poseidon2(v, holder), poseidon2(rnd, nullifier));
  }
  const nullifier = poseidon2(random, pk_b);
  const entry = compute_entry(value, pk_b, random, nullifier);

  const commitment = toBytes32(entry);
  const valueHex = toBytes32(value);
  const pkHex = toBytes32(pk_b);
  const randomHex = toBytes32(random);
  const nullifierHex = toBytes32(nullifier);

  console.log("[smoke] commitment:", commitment);
  console.log("[smoke] nullifier:", nullifierHex);

  // Prove via web depositProver (tsx resolves .ts)
  const depositProverPath = path.join(
    REPO_ROOT,
    "web",
    "app",
    "lib",
    "depositProver.ts",
  );
  if (!existsSync(depositProverPath)) {
    throw new Error(`depositProver not found at ${depositProverPath}`);
  }
  console.log("[smoke] generating deposit proof via", depositProverPath);
  let proofHex;
  let publicInputsRaw;
  try {
    const { generateDepositProof } = await import(depositProverPath);
    const proved = await generateDepositProof({
      value: valueHex,
      commitment,
      pk_b: pkHex,
      random: randomHex,
      nullifier: nullifierHex,
    });
    proofHex = proved.proofHex;
    publicInputsRaw = proved.publicInputs;
  } catch (err) {
    console.error("[smoke] PROVE FAILED:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 2;
    return;
  }

  const publicInputs = publicInputsRaw.map((x) => toBytes32(BigInt(x)));
  const proofByteLen = (proofHex.length - 2) / 2;
  console.log(
    "[smoke] proof bytes=%s publicInputs=%j",
    proofByteLen,
    publicInputs,
  );

  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  console.log("[smoke] chainId=", network.chainId.toString(), "wallet connecting…");
  const wallet = new ethers.Wallet(PK, provider);
  console.log("[smoke] depositor=", wallet.address);

  const token = new ethers.Contract(USDC, ERC20_ABI, wallet);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  let registrar = null;
  try {
    registrar = await pool.rootRegistrar();
  } catch {
    /* older ABI */
  }
  console.log("[smoke] pool.rootRegistrar=", registrar ?? "(unread)");
  console.log(
    "[smoke] PRIVATE_KEY is registrar?",
    registrar
      ? wallet.address.toLowerCase() === registrar.toLowerCase()
      : false,
  );

  const used = await pool.usedCommitments(commitment);
  if (used) {
    throw new Error(
      `Commitment already used. Retry with PAYMENT_INDEX=1..4 or SMOKE_RANDOM=<new>.`,
    );
  }

  let feeBps = BigInt(process.env.FEE_BPS ?? "30");
  let fee = 0n;
  let gross = amount;
  let spender = POOL;
  let useRouter = Boolean(ROUTER);

  if (useRouter) {
    const router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
    const mapped = await router.poolOf(USDC);
    if (mapped.toLowerCase() !== POOL.toLowerCase()) {
      console.warn(
        "[smoke] warning: router.poolOf(USDC)=%s != ARC_POOL_USDC_ADDRESS=%s",
        mapped,
        POOL,
      );
    }
    feeBps = await router.feeBps();
    fee = await router.quoteFee(amount);
    gross = await router.quoteGross(amount);
    spender = ROUTER;
    console.log(
      "[smoke] router=%s feeBps=%s fee=%s gross=%s",
      ROUTER,
      feeBps.toString(),
      fee.toString(),
      gross.toString(),
    );
  } else {
    console.log("[smoke] no router; direct pool deposit (no protocol fee)");
  }

  const bal = await token.balanceOf(wallet.address);
  console.log("[smoke] USDC balance=%s need gross=%s", bal.toString(), gross.toString());
  if (bal < gross) {
    throw new Error(`Insufficient USDC: have ${bal}, need ${gross}`);
  }

  const allowance = await token.allowance(wallet.address, spender);
  if (allowance < gross) {
    console.log("[smoke] approving spender=%s amount=%s", spender, gross.toString());
    const txA = await token.approve(spender, gross);
    console.log("[smoke] approve tx:", txA.hash);
    await txA.wait();
  } else {
    console.log("[smoke] allowance ok:", allowance.toString());
  }

  let tx;
  if (useRouter) {
    const router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
    try {
      await router.deposit.staticCall(USDC, commitment, amount, proofHex, publicInputs);
    } catch (simErr) {
      console.error(
        "[smoke] router.deposit staticCall failed:",
        simErr?.reason || simErr?.shortMessage || simErr?.message || simErr,
      );
      throw simErr;
    }
    tx = await router.deposit(USDC, commitment, amount, proofHex, publicInputs);
  } else {
    try {
      await pool.deposit.staticCall(commitment, amount, proofHex, publicInputs);
    } catch (simErr) {
      console.error(
        "[smoke] pool.deposit staticCall failed:",
        simErr?.reason || simErr?.shortMessage || simErr?.message || simErr,
      );
      throw simErr;
    }
    tx = await pool.deposit(commitment, amount, proofHex, publicInputs);
  }

  console.log("[smoke] deposit tx:", tx.hash);
  const receipt = await tx.wait();
  console.log(
    "[smoke] deposit confirmed status=%s block=%s",
    receipt.status,
    receipt.blockNumber,
  );
  console.log("SUCCESS", tx.hash);
  console.log(
    JSON.stringify(
      {
        success: true,
        txHash: tx.hash,
        commitment,
        amount: amount.toString(),
        fee: fee.toString(),
        gross: gross.toString(),
        depositor: wallet.address,
        rootRegistrar: registrar,
        withdrawBlockedByRegistrar:
          !registrar ||
          wallet.address.toLowerCase() !== String(registrar).toLowerCase(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("[smoke] FAILURE:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
