import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Chain } from "viem";

// RPC scan can take a while on first run or with many blocks (e.g. Monad rate limits)
export const maxDuration = 60;
import { CHAINS, type SupportedChainId, type ChainConfig } from "@/lib/constants";
import sql, { ensureSchema } from "@/lib/db";

// Block range per getLogs call. Start with 2000; fall back to smaller chunks on error.
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

function toViemChain(c: ChainConfig): Chain {
  return {
    id: c.id,
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: { default: { name: c.explorerName, url: c.explorerUrl } },
  } as const satisfies Chain;
}

type DepositLog = { sender: string; commitment: string; blockNumber: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLogsWithRetry(
  client: ReturnType<typeof createPublicClient>,
  pool: `0x${string}`,
  from: bigint,
  to: bigint,
): Promise<DepositLog[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      try {
        const logs = await client.getLogs({
          address: pool,
          event: depositEvent,
          fromBlock: from,
          toBlock: to,
        });
        return logs.map((log) => ({
          sender: log.args.depositor ?? "",
          commitment: log.args.commitment ?? "",
          blockNumber: String(log.blockNumber),
        }));
      } catch {
        const logs = await client.getLogs({
          address: pool,
          event: depositEventLegacy,
          fromBlock: from,
          toBlock: to,
        });
        return logs.map((log) => ({
          sender: log.args.sender ?? "",
          commitment: log.args.commitment ?? "",
          blockNumber: String(log.blockNumber),
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If range too large for this RPC, split in half and retry
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

async function scanRange(
  client: ReturnType<typeof createPublicClient>,
  pool: `0x${string}`,
  from: bigint,
  to: bigint,
): Promise<DepositLog[]> {
  const ranges: { from: bigint; to: bigint }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const end = cursor + CHUNK_SIZE > to ? to : cursor + CHUNK_SIZE;
    ranges.push({ from: cursor, to: end });
    cursor = end + BigInt(1);
  }

  const logs: DepositLog[] = [];

  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((r) => fetchLogsWithRetry(client, pool, r.from, r.to)),
    );
    for (const chunk of results) {
      logs.push(...chunk);
    }
    if (i + CONCURRENCY < ranges.length) {
      await sleep(300);
    }
  }

  return logs;
}

export async function GET(req: NextRequest) {
  const chainIdParam = req.nextUrl.searchParams.get("chain_id");
  const poolParam = req.nextUrl.searchParams.get("pool_address");
  const tokenSymbol = req.nextUrl.searchParams.get("token_symbol");
  const chainId = Number(chainIdParam) as SupportedChainId;
  const config = CHAINS[chainId];

  if (!config || config.placeholder) {
    return NextResponse.json(
      { error: `Chain ${chainId} not supported or not deployed` },
      { status: 400 },
    );
  }

  const poolAddress = (poolParam as `0x${string}` | null)
    ?? (tokenSymbol && config.pools[tokenSymbol]?.pool)
    ?? config.contracts.pool;
  const poolKey = poolAddress.toLowerCase();

  try {
  await ensureSchema();

  // RPC scan: catch errors so we still return cached data if the RPC is down/rate-limited
  try {
    const client = createPublicClient({
      chain: toViemChain(config),
      transport: http(config.rpcUrl),
    });

    const latest = await client.getBlockNumber();

    const [cursorRow] = await sql`
      SELECT last_block FROM scan_cursor
      WHERE chain_id = ${chainId} AND pool_address = ${poolKey}
    `;
    const lastScanned = cursorRow ? BigInt(cursorRow.last_block) : null;
    const scanFrom = lastScanned != null ? lastScanned + BigInt(1) : config.deployBlock;

    if (scanFrom <= latest) {
      const newLogs = await scanRange(client, poolAddress, scanFrom, latest);

      if (newLogs.length > 0) {
        await sql`
          INSERT INTO deposit_events_cache ${sql(
            newLogs.map((l) => ({
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
  } catch (scanErr) {
    // Log but don't fail, return cached data below
    console.error(`RPC scan failed for chain ${chainId}:`, scanErr instanceof Error ? scanErr.message : scanErr);
  }

  // Primary source: notes table for this pool (or all notes on chain if pool unknown in notes)
  const noteRows = await sql`
    SELECT commitment FROM notes
    WHERE chain_id = ${chainId}
      AND commitment IS NOT NULL AND commitment != ''
      AND (pool_address IS NULL OR lower(pool_address) = ${poolKey} OR pool_address = '')
    ORDER BY created_at ASC
  `;

  const seenCommitments = new Set<string>();
  const events: { sender: string; commitment: string; blockNumber: string }[] = [];

  for (const row of noteRows) {
    const c = (row.commitment as string)?.trim();
    if (c) {
      const key = c.toLowerCase();
      if (!seenCommitments.has(key)) {
        seenCommitments.add(key);
        events.push({ sender: "", commitment: c, blockNumber: "0" });
      }
    }
  }

  const cachedEvents = await sql`
    SELECT sender, commitment, block_number as "blockNumber"
    FROM deposit_events_cache
    WHERE chain_id = ${chainId} AND pool_address = ${poolKey}
    ORDER BY id ASC
  `;
  for (const e of cachedEvents) {
    const c = (e.commitment as string)?.trim();
    if (c && !seenCommitments.has(c.toLowerCase())) {
      seenCommitments.add(c.toLowerCase());
      events.push({
        sender: (e.sender as string) ?? "",
        commitment: c,
        blockNumber: (e.blockNumber as string) ?? "0",
      });
    }
  }

  return NextResponse.json(events);
  } catch (err) {
    console.error("deposit-events error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
