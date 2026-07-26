import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, type ChainConfig, type SupportedChainId } from "@/lib/constants";
import sql, { ensureSchema } from "@/lib/db";
import { ServerMerkleTree, bigintToBytes32 } from "./serverMerkle";

export const maxDuration = 60;

/** Larger chunks cut RPC round-trips on fast chains (Monad ~640k blocks from deploy). */
const CHUNK_SIZE = BigInt(5000);
const CONCURRENCY = 4;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;
/** Leave headroom under route maxDuration so we can still return / registerRoot. */
const DEFAULT_SCAN_BUDGET_MS = 25_000;

const depositEvent = parseAbiItem(
  "event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount)",
);
const depositEventLegacy = parseAbiItem(
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
);

const POOL_ABI = parseAbi([
  "function registerRoot(bytes32 root) external",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function rootRegistrar() view returns (address)",
]);

type DepositLog = {
  sender: string;
  commitment: string;
  blockNumber: string;
  logIndex: number;
};

/** Per-pool async mutex so concurrent deposits don't race nonce / root calc. */
const poolLocks = new Map<string, Promise<unknown>>();

function withPoolLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = poolLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  poolLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function toViemChain(c: ChainConfig): Chain {
  return {
    id: c.id,
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: { default: { name: c.explorerName, url: c.explorerUrl } },
  } as const satisfies Chain;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registrarPrivateKey(): Hex | null {
  const raw = process.env.ROOT_REGISTRAR_PRIVATE_KEY?.trim();
  if (!raw) return null;
  // Accept quoted / noisy values (e.g. copied from another .env) — keep only 32-byte hex.
  const match = raw.match(/0x?([0-9a-fA-F]{64})/);
  if (!match) return null;
  return `0x${match[1]}` as Hex;
}

async function fetchLogsWithRetry(
  client: ReturnType<typeof createPublicClient>,
  pool: `0x${string}`,
  from: bigint,
  to: bigint,
): Promise<DepositLog[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Wrong event ABI returns [] without throwing — query both formats and merge.
      const [current, legacy] = await Promise.all([
        client.getLogs({
          address: pool,
          event: depositEvent,
          fromBlock: from,
          toBlock: to,
        }),
        client.getLogs({
          address: pool,
          event: depositEventLegacy,
          fromBlock: from,
          toBlock: to,
        }),
      ]);

      const mapped: DepositLog[] = [
        ...current.map((log) => ({
          sender: log.args.depositor ?? "",
          commitment: (log.args.commitment ?? "") as string,
          blockNumber: String(log.blockNumber),
          logIndex: Number(log.logIndex ?? 0),
        })),
        ...legacy.map((log) => ({
          sender: log.args.sender ?? "",
          commitment: (log.args.commitment ?? "") as string,
          blockNumber: String(log.blockNumber),
          logIndex: Number(log.logIndex ?? 0),
        })),
      ];

      const seen = new Set<string>();
      const deduped: DepositLog[] = [];
      for (const row of mapped) {
        const c = row.commitment?.toLowerCase();
        if (!c || seen.has(c)) continue;
        seen.add(c);
        deduped.push(row);
      }
      return deduped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if ((msg.includes("range") || msg.includes("block")) && to - from > BigInt(100)) {
        const mid = from + (to - from) / BigInt(2);
        const [left, right] = await Promise.all([
          fetchLogsWithRetry(client, pool, from, mid),
          fetchLogsWithRetry(client, pool, mid + BigInt(1), to),
        ]);
        return [...left, ...right];
      }
      if (msg.includes("rate limit") && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  return [];
}

async function insertDepositLogs(
  chainId: SupportedChainId,
  poolKey: string,
  logs: DepositLog[],
): Promise<void> {
  if (logs.length === 0) return;
  logs.sort((a, b) => {
    const bn = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (bn !== 0n) return bn < 0n ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
  await sql`
    INSERT INTO deposit_events_cache ${sql(
      logs.map((l) => ({
        chain_id: chainId,
        pool_address: poolKey,
        block_number: l.blockNumber,
        sender: l.sender,
        commitment: l.commitment,
      })),
    )}
    ON CONFLICT (chain_id, pool_address, commitment) DO NOTHING
  `;
}

async function setScanCursor(
  chainId: SupportedChainId,
  poolKey: string,
  lastBlock: bigint,
): Promise<void> {
  const lastBlockStr = String(lastBlock);
  await sql`
    INSERT INTO scan_cursor (chain_id, pool_address, last_block)
    VALUES (${chainId}, ${poolKey}, ${lastBlockStr})
    ON CONFLICT (chain_id, pool_address)
    DO UPDATE SET last_block = EXCLUDED.last_block
    WHERE scan_cursor.last_block < EXCLUDED.last_block
  `;
}

/**
 * Cache a single verified Deposit (from POST /api/notes) so claim does not wait
 * for a full RPC rescan — critical on Monad where deploy→tip is hundreds of k blocks.
 */
export async function cacheVerifiedDeposit(params: {
  chainId: SupportedChainId;
  poolAddress: `0x${string}`;
  commitment: string;
  blockNumber: string;
  sender?: string;
}): Promise<void> {
  await ensureSchema();
  const poolKey = params.poolAddress.toLowerCase();
  const commitment = params.commitment.trim();
  if (!commitment) return;
  await insertDepositLogs(params.chainId, poolKey, [
    {
      sender: params.sender ?? "",
      commitment,
      blockNumber: params.blockNumber,
      logIndex: 0,
    },
  ]);
}

/**
 * Seed cache from notes that already have a confirmed deposit_tx (receipt → Deposit log).
 * Covers gaps when a full historical getLogs scan times out (Monad).
 */
async function seedCacheFromNotes(
  config: ChainConfig,
  chainId: SupportedChainId,
  poolAddress: `0x${string}`,
): Promise<number> {
  const poolKey = poolAddress.toLowerCase();
  const missing = await sql`
    SELECT n.commitment, n.deposit_tx
    FROM notes n
    WHERE n.chain_id = ${chainId}
      AND lower(n.pool_address) = ${poolKey}
      AND n.deposit_tx IS NOT NULL
      AND n.deposit_tx <> ''
      AND n.commitment IS NOT NULL
      AND n.commitment <> ''
      AND NOT EXISTS (
        SELECT 1 FROM deposit_events_cache d
        WHERE d.chain_id = ${chainId}
          AND d.pool_address = ${poolKey}
          AND lower(d.commitment) = lower(n.commitment)
      )
  `;
  if (missing.length === 0) return 0;

  const client = createPublicClient({
    chain: toViemChain(config),
    transport: http(config.rpcUrl),
  });

  const logs: DepositLog[] = [];
  for (const row of missing) {
    const txHash = String(row.deposit_tx ?? "").trim() as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) continue;
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") continue;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== poolKey) continue;
        // indexed commitment = topic[2] for both Deposit ABIs
        const commitment = log.topics?.[2];
        if (!commitment) continue;
        const depositor = log.topics?.[1]
          ? (`0x${log.topics[1].slice(26)}` as string)
          : "";
        logs.push({
          sender: depositor,
          commitment,
          blockNumber: String(receipt.blockNumber),
          logIndex: Number(log.logIndex ?? 0),
        });
      }
    } catch (err) {
      console.error(
        `seedCacheFromNotes: failed tx ${txHash.slice(0, 12)}…`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await insertDepositLogs(chainId, poolKey, logs);
  return logs.length;
}

/**
 * Incremental RPC scan. Advances scan_cursor after each successful batch so
 * subsequent requests make progress instead of restarting from deploy every time.
 */
async function scanAndCacheDeposits(
  config: ChainConfig,
  chainId: SupportedChainId,
  poolAddress: `0x${string}`,
  timeBudgetMs: number = DEFAULT_SCAN_BUDGET_MS,
): Promise<{ scannedTo: bigint | null; complete: boolean }> {
  const poolKey = poolAddress.toLowerCase();
  const client = createPublicClient({
    chain: toViemChain(config),
    transport: http(config.rpcUrl),
  });
  const latest = await client.getBlockNumber();
  const deadline = Date.now() + timeBudgetMs;

  const [cursorRow] = await sql`
    SELECT last_block FROM scan_cursor
    WHERE chain_id = ${chainId} AND pool_address = ${poolKey}
  `;
  const lastScanned = cursorRow ? BigInt(cursorRow.last_block as string) : null;
  const scanFrom = lastScanned != null ? lastScanned + BigInt(1) : config.deployBlock;

  if (scanFrom > latest) {
    return { scannedTo: latest, complete: true };
  }

  const ranges: { from: bigint; to: bigint }[] = [];
  let cursor = scanFrom;
  while (cursor <= latest) {
    const end = cursor + CHUNK_SIZE > latest ? latest : cursor + CHUNK_SIZE;
    ranges.push({ from: cursor, to: end });
    cursor = end + BigInt(1);
  }

  let advancedTo: bigint | null = lastScanned;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) {
      if (advancedTo != null) await setScanCursor(chainId, poolKey, advancedTo);
      return { scannedTo: advancedTo, complete: false };
    }

    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((r) => fetchLogsWithRetry(client, poolAddress, r.from, r.to)),
    );
    const logs: DepositLog[] = [];
    for (const chunk of results) logs.push(...chunk);
    await insertDepositLogs(chainId, poolKey, logs);

    const batchEnd = batch[batch.length - 1]!.to;
    advancedTo = batchEnd;
    await setScanCursor(chainId, poolKey, batchEnd);
  }

  return { scannedTo: latest, complete: true };
}

/**
 * Ensure deposit_events_cache is usable for Merkle builds: seed from notes, then
 * continue the historical RPC scan within a time budget.
 */
export async function ensurePoolDepositCache(params: {
  chainId: SupportedChainId;
  poolAddress: `0x${string}`;
  timeBudgetMs?: number;
}): Promise<{
  events: { sender: string; commitment: string; blockNumber: string }[];
  scanComplete: boolean;
}> {
  const config = CHAINS[params.chainId];
  if (!config || config.placeholder) {
    throw new Error(`Chain ${params.chainId} not supported or not deployed`);
  }

  await ensureSchema();
  const poolKey = params.poolAddress.toLowerCase();

  await seedCacheFromNotes(config, params.chainId, params.poolAddress);

  let scanComplete = true;
  try {
    const scan = await scanAndCacheDeposits(
      config,
      params.chainId,
      params.poolAddress,
      params.timeBudgetMs ?? DEFAULT_SCAN_BUDGET_MS,
    );
    scanComplete = scan.complete;
  } catch (scanErr) {
    console.error(
      `RPC scan failed for chain ${params.chainId}:`,
      scanErr instanceof Error ? scanErr.message : scanErr,
    );
    scanComplete = false;
  }

  const cachedEvents = await sql`
    SELECT sender, commitment, block_number as "blockNumber"
    FROM deposit_events_cache
    WHERE chain_id = ${params.chainId}
      AND pool_address = ${poolKey}
      AND pool_address <> ''
    ORDER BY block_number ASC, id ASC
  `;

  const events = cachedEvents
    .map((e) => ({
      sender: (e.sender as string) ?? "",
      commitment: String(e.commitment ?? "").trim(),
      blockNumber: (e.blockNumber as string) ?? "0",
    }))
    .filter((e) => e.commitment);

  return { events, scanComplete };
}

async function loadOrderedCommitments(
  chainId: SupportedChainId,
  poolKey: string,
): Promise<string[]> {
  const rows = await sql`
    SELECT commitment
    FROM deposit_events_cache
    WHERE chain_id = ${chainId}
      AND pool_address = ${poolKey}
      AND pool_address <> ''
    ORDER BY block_number ASC, id ASC
  `;
  return rows
    .map((r) => String(r.commitment ?? "").trim())
    .filter(Boolean);
}

export type SyncPoolRootResult = {
  ok: boolean;
  skipped?: string;
  root?: string;
  leafCount?: number;
  txHash?: string;
  alreadyKnown?: boolean;
};

/**
 * Rebuild Merkle tip from on-chain Deposit events and register it if new.
 * Serialized per pool to avoid overlapping roots / nonce races under high deposit flow.
 */
export async function syncPoolRoot(params: {
  chainId: SupportedChainId;
  poolAddress: `0x${string}`;
}): Promise<SyncPoolRootResult> {
  const config = CHAINS[params.chainId];
  if (!config || config.placeholder) {
    return { ok: false, skipped: "chain not deployed" };
  }

  const pk = registrarPrivateKey();
  if (!pk) {
    return { ok: false, skipped: "ROOT_REGISTRAR_PRIVATE_KEY unset" };
  }
  // Reject malformed values early (non-hex / wrong length after sanitize).
  if (pk.length !== 66) {
    return { ok: false, skipped: "ROOT_REGISTRAR_PRIVATE_KEY invalid" };
  }

  const poolKey = params.poolAddress.toLowerCase();

  return withPoolLock(poolKey, async () => {
    await ensureSchema();
    // Seed from notes + incremental scan (Monad cannot full-rescan deploy→tip in one request).
    await ensurePoolDepositCache({
      chainId: params.chainId,
      poolAddress: params.poolAddress,
      timeBudgetMs: 40_000,
    });

    const commitments = await loadOrderedCommitments(params.chainId, poolKey);
    if (commitments.length === 0) {
      return { ok: true, skipped: "no deposits", leafCount: 0 };
    }

    const tree = new ServerMerkleTree();
    for (const c of commitments) {
      tree.insert(BigInt(c));
    }
    const root = await tree.computeRoot();
    const rootHex = bigintToBytes32(root);

    const account = privateKeyToAccount(pk);
    const publicClient = createPublicClient({
      chain: toViemChain(config),
      transport: http(config.rpcUrl),
    });

    const known = await publicClient.readContract({
      address: params.poolAddress,
      abi: POOL_ABI,
      functionName: "isKnownRoot",
      args: [rootHex],
    });
    if (known) {
      return {
        ok: true,
        alreadyKnown: true,
        root: rootHex,
        leafCount: tree.size,
      };
    }

    const onchainRegistrar = await publicClient.readContract({
      address: params.poolAddress,
      abi: POOL_ABI,
      functionName: "rootRegistrar",
    });
    if (
      onchainRegistrar &&
      onchainRegistrar.toLowerCase() !== account.address.toLowerCase()
    ) {
      return {
        ok: false,
        skipped: `registrar mismatch: on-chain ${onchainRegistrar}, key ${account.address}`,
        root: rootHex,
        leafCount: tree.size,
      };
    }

    const walletClient = createWalletClient({
      account,
      chain: toViemChain(config),
      transport: http(config.rpcUrl),
    });

    try {
      const txHash = await walletClient.writeContract({
        address: params.poolAddress,
        abi: POOL_ABI,
        functionName: "registerRoot",
        args: [rootHex],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return {
        ok: true,
        root: rootHex,
        leafCount: tree.size,
        txHash,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Another worker may have registered the same tip
      if (msg.includes("root already known") || msg.toLowerCase().includes("already known")) {
        return {
          ok: true,
          alreadyKnown: true,
          root: rootHex,
          leafCount: tree.size,
        };
      }
      throw err;
    }
  });
}
