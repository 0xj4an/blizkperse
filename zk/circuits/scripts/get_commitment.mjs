#!/usr/bin/env node
/**
 * Lee new_commitment del Prover.toml (el commitment que usa el circuito).
 * Uso:
 *   node scripts/get_commitment.mjs           # imprime 0x...
 *   COMMITMENT=$(node scripts/get_commitment.mjs)  # para usar en env
 */
import fs from "fs";
import path from "path";

const fromCircuits = path.join(process.cwd(), "Prover.toml");
const fromRoot = path.join(process.cwd(), "circuits", "Prover.toml");
const proverPath = fs.existsSync(fromCircuits) ? fromCircuits : fs.existsSync(fromRoot) ? fromRoot : null;
if (!proverPath) {
  console.error("Prover.toml not found. Run from circuits/ or repo root.");
  process.exit(1);
}

const content = fs.readFileSync(proverPath, "utf8");
const m = content.match(/new_commitment\s*=\s*"([^"]+)"/);
if (!m) {
  console.error("new_commitment not found in Prover.toml");
  process.exit(1);
}

const commitment = m[1].trim();
if (!commitment.startsWith("0x") || commitment.length !== 66) {
  console.error("new_commitment in Prover.toml must be 0x + 64 hex chars");
  process.exit(1);
}

console.log(commitment);
