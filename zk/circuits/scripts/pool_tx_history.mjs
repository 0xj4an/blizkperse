#!/usr/bin/env node
/**
 * Lee los eventos del contrato ShieldedPool desde la RPC y muestra el flujo
 * de transacciones en orden (Deposit, Withdraw, registerRoot, TransferIntent).
 *
 * Uso (desde zk/circuits/):
 *   MONAD_RPC=https://rpc3.monad.xyz node scripts/pool_tx_history.mjs
 *
 * Opcional: POOL_ADDRESS, FROM_BLOCK (default: 56234450), TO_BLOCK (default: latest).
 * Para evitar "Block range too large" o rate limit: usa un rango corto, ej. FROM_BLOCK=<último-500> TO_BLOCK=latest.
 */

import { ethers } from "ethers";

const POOL_DEFAULT = "0x085BD9c0C568BE5093130E2359B00e46cb0800d1";
const DEPLOY_BLOCK_MONAD = 56_234_450;
const CHUNK_SIZE = 256;

const POOL_ABI = [
  "event RootRegistered(bytes32 indexed root)",
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
  "event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment)",
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier)",
];

async function main() {
  const RPC = process.env.MONAD_RPC || "https://rpc3.monad.xyz";
  const POOL = process.env.POOL_ADDRESS || POOL_DEFAULT;
  const fromBlock = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : BigInt(DEPLOY_BLOCK_MONAD);
  const toBlock = process.env.TO_BLOCK ? BigInt(process.env.TO_BLOCK) : "latest";

  const provider = new ethers.JsonRpcProvider(RPC);
  const pool = new ethers.Contract(POOL, POOL_ABI, provider);

  const current = toBlock === "latest" ? BigInt(await provider.getBlockNumber()) : toBlock;
  const iface = new ethers.Interface(POOL_ABI);
  const allLogs = [];

  for (let start = fromBlock; start <= current; start += BigInt(CHUNK_SIZE)) {
    const end = start + BigInt(CHUNK_SIZE) - 1n > current ? current : start + BigInt(CHUNK_SIZE) - 1n;
    const logs = await provider.getLogs({
      address: POOL,
      fromBlock: start,
      toBlock: end,
    });
    allLogs.push(...logs);
    if (start + BigInt(CHUNK_SIZE) <= current) await new Promise((r) => setTimeout(r, 200));
  }

  const logs = allLogs;

  // Ordenar por blockNumber y logIndex
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
    return a.index - b.index;
  });

  const entries = [];
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;
      const block = await provider.getBlock(log.blockNumber);
      entries.push({
        blockNumber: log.blockNumber,
        logIndex: log.index,
        timestamp: block?.timestamp ?? 0n,
        name: parsed.name,
        args: parsed.args,
      });
    } catch (_) {
      // evento desconocido
    }
  }

  console.log("Pool:", POOL);
  console.log("RPC:", RPC);
  console.log("Total eventos:", entries.length);
  console.log("");

  let nDeposit = 0;
  let nWithdraw = 0;
  let nRoot = 0;
  let nIntent = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const block = e.blockNumber.toString();
    const rootShort = (r) => (r && r.length >= 10 ? r.slice(0, 10) + "..." : String(r));
    const addrShort = (a) => (a && a.length >= 10 ? a.slice(0, 10) + "..." : String(a));

    let line = `${i + 1}. [Block ${block}] `;
    switch (e.name) {
      case "RootRegistered":
        nRoot++;
        line += `registerRoot — root = ${rootShort(e.args.root)}`;
        break;
      case "Deposit":
        nDeposit++;
        line += `Deposit — 1 USDC enviado por ${addrShort(e.args.sender)}, commitment = ${rootShort(e.args.commitment)}`;
        break;
      case "Withdraw":
        nWithdraw++;
        line += `Withdraw — 1 USDC enviado a ${addrShort(e.args.recipient)}, nullifier = ${rootShort(e.args.nullifier)}`;
        break;
      case "TransferIntent":
        nIntent++;
        line += `TransferIntent — root = ${rootShort(e.args.expectedRoot)}, nullifier = ${rootShort(e.args.nullifierIn)}, newCommitment = ${rootShort(e.args.newCommitment)}`;
        break;
      default:
        line += e.name;
    }
    console.log(line);
  }

  console.log("");
  console.log("Resumen: registerRoot =", nRoot, "| Deposit =", nDeposit, "| Withdraw =", nWithdraw, "| TransferIntent =", nIntent);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
