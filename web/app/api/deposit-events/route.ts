import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Chain } from "viem";
import { CHAINS, type SupportedChainId, type ChainConfig } from "@/lib/constants";
import sql, { ensureSchema } from "@/lib/db";

// Monad RPC: max 999 blocks per getLogs, rate-limited
const CHUNK_SIZE = BigInt(999);
const CONCURRENCY = 3;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

const depositEvent = parseAbiItem(
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
      const logs = await client.getLogs({
        address: pool,
        event: depositEvent,
        fromBlock: from,
        toBlock: to,
      });
      return logs.map((log) => ({
        sender: log.args.sender ?? "",
        commitment: log.args.commitment ?? "",
        blockNumber: String(log.blockNumber),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
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
  const chainId = Number(chainIdParam) as SupportedChainId;
  const config = CHAINS[chainId];

  if (!config || config.placeholder) {
    return NextResponse.json(
      { error: `Chain ${chainId} not supported or not deployed` },
      { status: 400 },
    );
  }

  await ensureSchema();

  const client = createPublicClient({
    chain: toViemChain(config),
    transport: http(config.rpcUrl),
  });

  const latest = await client.getBlockNumber();

  // Get cached cursor — where we left off scanning
  const [cursorRow] = await sql`
    SELECT last_block FROM scan_cursor WHERE chain_id = ${chainId}
  `;
  const lastScanned = cursorRow ? BigInt(cursorRow.last_block) : null;
  const scanFrom = lastScanned != null ? lastScanned + BigInt(1) : config.deployBlock;

  // Scan only new blocks (if any)
  if (scanFrom <= latest) {
    const newLogs = await scanRange(client, config.contracts.pool, scanFrom, latest);

    if (newLogs.length > 0) {
      await sql`
        INSERT INTO deposit_events_cache ${sql(
          newLogs.map((l) => ({
            chain_id: chainId,
            block_number: l.blockNumber,
            sender: l.sender,
            commitment: l.commitment,
          })),
        )}
        ON CONFLICT (chain_id, commitment) DO NOTHING
      `;
    }

    // Update cursor
    await sql`
      INSERT INTO scan_cursor (chain_id, last_block)
      VALUES (${chainId}, ${String(latest)})
      ON CONFLICT (chain_id)
      DO UPDATE SET last_block = ${String(latest)}
    `;
  }

  // Check event cache first
  let events = await sql`
    SELECT sender, commitment, block_number as "blockNumber"
    FROM deposit_events_cache
    WHERE chain_id = ${chainId}
    ORDER BY id ASC
  `;

  // Fallback: if on-chain scan found nothing (Monad prunes historical logs),
  // use commitments stored in the notes table at deposit time
  if (events.length === 0) {
    events = await sql`
      SELECT '' as sender, n.commitment, '0' as "blockNumber"
      FROM notes n
      WHERE n.chain_id = ${chainId}
      ORDER BY n.created_at ASC
    `;
  }

  return NextResponse.json(events);
}
