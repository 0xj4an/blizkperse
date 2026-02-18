#!/usr/bin/env node
/**
 * Runner: ejecuta circuits/scripts/register_root.mjs desde la raíz del repo.
 * Uso: node scripts/register_root.mjs
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.join(rootDir, "circuits", "scripts", "register_root.mjs");

const child = spawn(process.execPath, [scriptPath], {
  stdio: "inherit",
  env: process.env,
  cwd: rootDir,
});
child.on("exit", (code) => process.exit(code ?? 0));
