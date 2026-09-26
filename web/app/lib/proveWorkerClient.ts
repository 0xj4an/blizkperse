import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import readline from "readline";

import type { DepositInputs } from "./depositProver";

export type WithdrawInputs = {
  value: string;
  nullifier: string;
  merkle_proof_length: number;
  expected_merkle_root: string;
  recipient: string;
  pk_b: string;
  random: string;
  merkle_proof_indices: number[];
  merkle_proof_siblings: string[];
};

const IDLE_MS = Number(process.env.PROVE_WORKER_IDLE_MS || 45_000);
const JOB_MS = Number(process.env.PROVE_WORKER_JOB_MS || 120_000);

type Pending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let child: ChildProcess | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const pending = new Map<string, Pending>();
let parentIdle: ReturnType<typeof setTimeout> | null = null;
let sendChain: Promise<unknown> = Promise.resolve();

function workerPath(): string {
  const candidates = [
    path.join(process.cwd(), "scripts", "prove-worker.mjs"),
    path.join(process.cwd(), "web", "scripts", "prove-worker.mjs"),
    "/app/scripts/prove-worker.mjs",
    path.resolve(process.cwd(), "..", "scripts", "prove-worker.mjs"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`prove-worker.mjs not found. Tried: ${candidates.join(", ")}`);
  }
  return found;
}

function useInProcess(): boolean {
  return process.env.PROVE_IN_PROCESS === "1";
}

function clearParentIdle() {
  if (parentIdle) {
    clearTimeout(parentIdle);
    parentIdle = null;
  }
}

function scheduleKill() {
  clearParentIdle();
  parentIdle = setTimeout(() => {
    if (pending.size > 0) {
      scheduleKill();
      return;
    }
    if (child && !child.killed) {
      console.info(`[proveWorker] idle ${IDLE_MS}ms — stopping child pid=${child.pid}`);
      child.kill("SIGTERM");
    }
  }, IDLE_MS);
}

function failAll(err: Error) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
    pending.delete(id);
  }
}

function attach(proc: ChildProcess, onReady: () => void) {
  const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      console.info(`[prove-worker:stdout] ${trimmed}`);
      return;
    }
    if (msg.ready) {
      console.info("[proveWorker] child ready");
      onReady();
      return;
    }
    const id = String(msg.id ?? "");
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    clearTimeout(slot.timer);
    if (msg.ok) slot.resolve(msg);
    else slot.reject(new Error(String(msg.error || "prove-worker failed")));
    if (pending.size === 0) scheduleKill();
  });

  proc.stderr?.on("data", (buf: Buffer) => {
    const text = buf.toString().trimEnd();
    if (text) console.info(text);
  });

  proc.on("exit", (code, signal) => {
    console.info(`[proveWorker] child exit code=${code} signal=${signal}`);
    if (child === proc) {
      child = null;
      ready = null;
    }
    failAll(new Error(`prove-worker exited (code=${code} signal=${signal})`));
  });
}

async function ensureWorker(): Promise<ChildProcess> {
  if (child && child.exitCode === null && !child.killed && ready) {
    await ready;
    if (child && child.exitCode === null && !child.killed) return child;
  }

  const script = workerPath();
  console.info(`[proveWorker] spawn ${script}`);
  const proc = spawn(process.execPath, [script], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  child = proc;

  let markReady: () => void = () => {};
  ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("prove-worker ready timeout")), 15_000);
    markReady = () => {
      clearTimeout(t);
      resolve();
    };
    proc.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
  attach(proc, markReady);
  await ready;
  return proc;
}

function send(kind: "deposit" | "withdraw", inputs: unknown): Promise<Record<string, unknown>> {
  const job = sendChain.then(async () => {
    const proc = await ensureWorker();
    clearParentIdle();
    const id = String(++seq);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`prove-worker ${kind} timed out after ${JOB_MS}ms`));
      }, JOB_MS);
      pending.set(id, { resolve, reject, timer });
      proc.stdin!.write(`${JSON.stringify({ id, kind, inputs })}\n`);
    });
  });
  sendChain = job.catch(() => {});
  return job;
}

export async function generateDepositProofViaWorker(
  inputs: DepositInputs,
): Promise<{ proofHex: string; publicInputs: string[]; proofByteLen?: number }> {
  if (useInProcess()) {
    const { generateDepositProof } = await import("./depositProver");
    return generateDepositProof(inputs);
  }
  const msg = await send("deposit", inputs);
  return {
    proofHex: String(msg.proofHex),
    publicInputs: msg.publicInputs as string[],
    proofByteLen: typeof msg.proofByteLen === "number" ? msg.proofByteLen : undefined,
  };
}

export async function generateWithdrawProofViaWorker(
  inputs: WithdrawInputs,
): Promise<{ proofHex: string }> {
  if (useInProcess()) {
    const { generateWithdrawProof } = await import("./withdrawProver");
    return generateWithdrawProof(inputs);
  }
  const msg = await send("withdraw", inputs);
  return { proofHex: String(msg.proofHex) };
}
