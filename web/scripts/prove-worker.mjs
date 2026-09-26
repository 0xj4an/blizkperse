/**
 * Child-process Honk prover. Loads WASM only in this process; parent Next
 * stays small. Exits after PROVE_WORKER_IDLE_MS with no jobs (default 45s).
 *
 * Protocol: one JSON object per line on stdin / stdout.
 *   → {"id":"1","kind":"deposit"|"withdraw","inputs":{...}}
 *   ← {"id":"1","ok":true,...} | {"id":"1","ok":false,"error":"..."}
 * Logs go to stderr so stdout stays machine-readable.
 */
import { BackendType, Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { existsSync, readFileSync } from "fs";
import path from "path";
import readline from "readline";

const DEPOSIT_EVM_PROOF_SIZE = 7232;
const IDLE_MS = Number(process.env.PROVE_WORKER_IDLE_MS || 45_000);

const deposit = { noir: null, backend: null, bb: null, artifactPath: null };
const withdraw = { noir: null, backend: null, bb: null };

let idleTimer = null;

function log(msg) {
  process.stderr.write(`[prove-worker] ${msg}\n`);
}

function resolveCircuitDir() {
  const envCircuitsDir = process.env.CIRCUITS_DIR;
  const candidates = [
    ...(envCircuitsDir ? [envCircuitsDir] : []),
    "/app/zk/circuits",
    "/app/circuits",
    path.resolve(process.cwd(), "zk", "circuits"),
    path.resolve(process.cwd(), "circuits"),
    path.resolve(process.cwd(), "..", "zk", "circuits"),
    path.resolve(process.cwd(), "..", "..", "zk", "circuits"),
  ];
  const unique = [...new Set(candidates)];
  for (const dir of unique) {
    if (existsSync(path.join(dir, "Nargo.toml"))) {
      log(`CIRCUITS_DIR=${dir}`);
      return dir;
    }
  }
  throw new Error(
    `Circuit directory not found. cwd=${process.cwd()} CIRCUITS_DIR=${envCircuitsDir ?? "(unset)"}`,
  );
}

async function newBackend(artifactJson, label) {
  const api = await Barretenberg.new({
    threads: 1,
    backend: BackendType.Wasm,
    logger: (msg) => process.stderr.write(`[prove-worker:${label}] ${msg}\n`),
  });
  return { api, backend: new UltraHonkBackend(artifactJson.bytecode, api), noir: new Noir(artifactJson) };
}

async function initDeposit() {
  if (deposit.noir && deposit.backend) return;
  const circuitDir = resolveCircuitDir();
  const candidates = [
    path.join(circuitDir, "target", "deposit_circuit.json"),
    path.join(circuitDir, "target", "deposit.json"),
  ];
  const artifactPath = candidates.find((p) => existsSync(p));
  if (!artifactPath) {
    throw new Error(`Deposit circuit not found. Searched: ${candidates.join(", ")}`);
  }
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const created = await newBackend(artifactJson, "deposit");
  deposit.bb = created.api;
  deposit.backend = created.backend;
  deposit.noir = created.noir;
  deposit.artifactPath = artifactPath;
  log(`deposit artifact ${artifactPath}`);
}

async function initWithdraw() {
  if (withdraw.noir && withdraw.backend) return;
  const circuitDir = resolveCircuitDir();
  const artifactPath = path.join(circuitDir, "target", "with_foundry.json");
  if (!existsSync(artifactPath)) {
    throw new Error(`Withdraw circuit not found: ${artifactPath}`);
  }
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const created = await newBackend(artifactJson, "withdraw");
  withdraw.bb = created.api;
  withdraw.backend = created.backend;
  withdraw.noir = created.noir;
  log(`withdraw artifact ${artifactPath}`);
}

async function proveDeposit(inputs) {
  await initDeposit();
  const { witness } = await deposit.noir.execute(inputs);
  const proofData = await deposit.backend.generateProof(witness, { verifierTarget: "evm" });
  const proofBytes = Buffer.from(proofData.proof);
  if (proofBytes.length !== DEPOSIT_EVM_PROOF_SIZE) {
    throw new Error(
      `Deposit proof length ${proofBytes.length} != ${DEPOSIT_EVM_PROOF_SIZE}. Artifact: ${deposit.artifactPath}`,
    );
  }
  const ok = await deposit.backend.verifyProof(proofData, { verifierTarget: "evm" });
  if (!ok) {
    throw new Error("Deposit proof failed local UltraHonk verify before submit.");
  }
  const proofHex = `0x${proofBytes.toString("hex")}`;
  return {
    proofHex,
    publicInputs: [inputs.value, inputs.commitment],
    proofByteLen: proofBytes.length,
  };
}

async function proveWithdraw(inputs) {
  await initWithdraw();
  const { witness } = await withdraw.noir.execute(inputs);
  const proofData = await withdraw.backend.generateProof(witness, { verifierTarget: "evm" });
  const proofHex = `0x${Buffer.from(proofData.proof).toString("hex")}`;
  return { proofHex };
}

function bumpIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    log(`idle ${IDLE_MS}ms — exiting so WASM RSS is released`);
    shutdown(0);
  }, IDLE_MS);
}

async function shutdown(code) {
  if (idleTimer) clearTimeout(idleTimer);
  try {
    await deposit.bb?.destroy?.();
  } catch {
    /* ignore */
  }
  try {
    await withdraw.bb?.destroy?.();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

function reply(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    log(`bad json: ${trimmed.slice(0, 80)}`);
    return;
  }
  const { id, kind, inputs } = msg;
  try {
    if (kind === "deposit") {
      const result = await proveDeposit(inputs);
      reply({ id, ok: true, ...result });
    } else if (kind === "withdraw") {
      const result = await proveWithdraw(inputs);
      reply({ id, ok: true, ...result });
    } else {
      throw new Error(`unknown kind: ${kind}`);
    }
  } catch (err) {
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    bumpIdle();
  }
}

let lineQueue = Promise.resolve();
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  lineQueue = lineQueue.then(() => handleLine(line)).catch((err) => {
    log(`handler: ${err instanceof Error ? err.message : err}`);
  });
});
rl.on("close", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

bumpIdle();
reply({ ready: true });
log(`up idle=${IDLE_MS}ms pid=${process.pid}`);
