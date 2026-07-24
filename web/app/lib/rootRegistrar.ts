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

const CHUNK_SIZE = BigInt(2000);
const CONCURRENCY = 3;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

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
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
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

async function scanAndCacheDeposits(
  config: ChainConfig,
  chainId: SupportedChainId,
  poolAddress: `0x${string}`,
): Promise<void> {
  const poolKey = poolAddress.toLowerCase();
  const client = createPublicClient({
    chain: toViemChain(config),
    transport: http(config.rpcUrl),
  });
  const latest = await client.getBlockNumber();

  const [cursorRow] = await sql`
    SELECT last_block FROM scan_cursor
    WHERE chain_id = ${chainId} AND pool_address = ${poolKey}
  `;
  const lastScanned = cursorRow ? BigInt(cursorRow.last_block as string) : null;
  const scanFrom = lastScanned != null ? lastScanned + BigInt(1) : config.deployBlock;

  if (scanFrom > latest) return;

  const ranges: { from: bigint; to: bigint }[] = [];
  let cursor = scanFrom;
  while (cursor <= latest) {
    const end = cursor + CHUNK_SIZE > latest ? latest : cursor + CHUNK_SIZE;
    ranges.push({ from: cursor, to: end });
    cursor = end + BigInt(1);
  }

  const logs: DepositLog[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((r) => fetchLogsWithRetry(client, poolAddress, r.from, r.to)),
    );
    for (const chunk of results) logs.push(...chunk);
    if (i + CONCURRENCY < ranges.length) await sleep(300);
  }

  if (logs.length > 0) {
    // Stable order before insert so serial ids roughly follow chain order
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

  await sql`
    INSERT INTO scan_cursor (chain_id, pool_address, last_block)
    VALUES (${chainId}, ${poolKey}, ${String(latest)})
    ON CONFLICT (chain_id, pool_address)
    DO UPDATE SET last_block = ${String(latest)}
  `;
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

  const poolKey = params.poolAddress.toLowerCase();

  return withPoolLock(poolKey, async () => {
    await ensureSchema();
    await scanAndCacheDeposits(config, params.chainId, params.poolAddress);

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
