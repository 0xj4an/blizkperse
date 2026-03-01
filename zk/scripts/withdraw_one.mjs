#!/usr/bin/env node
/**
 * Runner: executes circuits/scripts/withdraw_one.mjs from the repo root.
 * Usage: PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs
 *        (PROOF_FILE can be proofs/withdraw.proof or circuits/proofs/withdraw.proof)
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.join(rootDir, "circuits", "scripts", "withdraw_one.mjs");

const child = spawn(process.execPath, [scriptPath], {
  stdio: "inherit",
  env: process.env,
  cwd: rootDir,
});
child.on("exit", (code) => process.exit(code ?? 0));
