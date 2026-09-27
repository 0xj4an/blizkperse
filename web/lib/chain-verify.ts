import {
  createPublicClient,
  http,
  parseAbiItem,
  type Chain,
  type Hash,
  type Hex,
  type Log,
  type TransactionReceipt,
} from "viem";
import { CHAINS, type SupportedChainId, type ChainConfig } from "@/lib/constants";

const depositEvent = parseAbiItem(
  "event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount)",
);
const depositEventLegacy = parseAbiItem(
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
);
/** Private depositBatch leaves — commitment is topic[1], not topic[2]. */
const commitmentInsertedEvent = parseAbiItem(
  "event CommitmentInserted(bytes32 indexed commitment, uint256 indexed denominationId)",
);
const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount)",
);
const withdrawDenomEvent = parseAbiItem(
  "event WithdrawDenom(address indexed recipient, bytes32 indexed nullifier, uint256 indexed denominationId, uint256 amount)",
);

const nullifiersAbi = [
  {
    type: "function",
    name: "nullifiers",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function toViemChain(c: ChainConfig): Chain {
  return {
    id: c.id,
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: { default: { name: c.explorerName, url: c.explorerUrl } },
  } as const satisfies Chain;
}

function getClient(config: ChainConfig) {
  return createPublicClient({
    chain: toViemChain(config),
    transport: http(config.rpcUrl),
  });
}

function normalizeHex32(value: string): Hex | null {
  const trimmed = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(trimmed)) return null;
  return trimmed as Hex;
}

function commitmentFromLog(log: Log): string | null {
  const topics = log.topics;
  // indexed commitment is topic[2] for both Deposit ABIs
  if (topics && topics.length >= 3 && topics[2]) return topics[2].toLowerCase();
  return null;
}

/** ShieldedPool.CommitmentInserted — commitment is topic[1]. */
function commitmentFromInsertedLog(log: Log): string | null {
  const topics = log.topics;
  if (topics && topics.length >= 2 && topics[1]) return topics[1].toLowerCase();
  return null;
}

/** PoolRouter.RoutedDeposit: commitment is the first word of non-indexed data. */
function commitmentFromRoutedDepositData(log: Log): string | null {
  const data = log.data?.toLowerCase?.() ?? "";
  if (!/^0x[0-9a-f]{64,}$/.test(data)) return null;
  return `0x${data.slice(2, 66)}`;
}

function poolFromRoutedDepositLog(log: Log): `0x${string}` | null {
  // RoutedDeposit(user, token, pool, …) — pool is topic[3]
  const topics = log.topics;
  if (!topics || topics.length < 4 || !topics[3]) return null;
  const topic = topics[3].toLowerCase();
  if (!/^0x0{24}[0-9a-f]{40}$/.test(topic)) return null;
  return `0x${topic.slice(26)}` as `0x${string}`;
}

function nullifierFromWithdrawLog(log: Log): string | null {
  const topics = log.topics;
  if (topics && topics.length >= 3 && topics[2]) return topics[2].toLowerCase();
  return null;
}

function resolvePoolAddress(
  config: ChainConfig,
  poolAddress?: string | null,
  tokenSymbol?: string | null,
): `0x${string}` {
  if (poolAddress && /^0x[0-9a-fA-F]{40}$/.test(poolAddress)) {
    return poolAddress as `0x${string}`;
  }
  if (tokenSymbol && config.pools[tokenSymbol]?.pool) {
    return config.pools[tokenSymbol].pool;
  }
  return config.contracts.pool;
}

export type DepositVerification = {
  ok: true;
  depositTx: Hash;
  blockNumber: string;
  poolAddress: `0x${string}`;
  /** Set when the matching log was CommitmentInserted (Private depositBatch). */
  denominationId?: number;
};

export type ClaimVerification = {
  ok: true;
  txHash: string | null;
  nullifierUsed: boolean;
};

/**
 * Confirm a deposit landed: receipt success + Deposit, CommitmentInserted (Private batch),
 * or RoutedDeposit with matching commitment.
 * Resolves the actual pool from receipt logs when env/config points at a stale pool address
 * (common after redeploy: router routes to the new pool while NEXT_PUBLIC_*_POOL_* is outdated).
 */
export async function verifyDepositOnChain(params: {
  chainId: number;
  commitment: string;
  depositTx: string;
  poolAddress?: string | null;
  tokenSymbol?: string | null;
}): Promise<DepositVerification> {
  const config = CHAINS[params.chainId as SupportedChainId];
  if (!config || config.placeholder) {
    throw new Error(`Unsupported chain_id ${params.chainId}`);
  }

  const commitment = normalizeHex32(params.commitment);
  const depositTx = normalizeHex32(params.depositTx);
  if (!commitment) throw new Error("Invalid commitment");
  if (!depositTx) throw new Error("Invalid deposit_tx");

  const expectedPool = resolvePoolAddress(config, params.poolAddress, params.tokenSymbol);
  const client = getClient(config);

  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: depositTx });
  } catch {
    throw new Error(`Deposit tx not found on ${config.name}: ${depositTx}`);
  }

  if (receipt.status !== "success") {
    throw new Error(`Deposit tx reverted on-chain: ${depositTx}`);
  }

  const expectedLower = expectedPool.toLowerCase();
  const routerLower = config.router?.toLowerCase?.() ?? "";
  const knownPools = new Set(
    Object.values(config.pools)
      .map((p) => p.pool.toLowerCase())
      .filter((a) => a && a !== "0x0000000000000000000000000000000000000000"),
  );
  knownPools.add(expectedLower);

  let resolvedPool: `0x${string}` | null = null;
  let denominationId: number | undefined;

  for (const log of receipt.logs) {
    const addr = log.address.toLowerCase() as `0x${string}`;

    // ShieldedPool.Deposit — commitment is indexed topic[2]; emitter is the pool.
    const fromDeposit = commitmentFromLog(log);
    if (fromDeposit === commitment) {
      if (addr === routerLower) {
        continue;
      }
      resolvedPool = addr;
      break;
    }

    // ShieldedPool.CommitmentInserted (Private depositBatch) — commitment topic[1],
    // denominationId topic[2].
    const fromInserted = commitmentFromInsertedLog(log);
    if (fromInserted === commitment && addr !== routerLower) {
      resolvedPool = addr;
      const denomTopic = log.topics?.[2];
      if (denomTopic) {
        const parsed = Number(BigInt(denomTopic));
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 63) {
          denominationId = parsed;
        }
      }
      break;
    }

    // PoolRouter.RoutedDeposit — commitment in data; pool in topic[3].
    if (addr === routerLower && commitmentFromRoutedDepositData(log) === commitment) {
      resolvedPool = poolFromRoutedDepositLog(log) ?? expectedPool;
      break;
    }
  }

  // Fallback: getLogs around the receipt block on expected + known pools.
  if (!resolvedPool) {
    const fromBlock = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n;
    const toBlock = receipt.blockNumber;
    const poolsToScan = [...knownPools];
    for (const poolAddr of poolsToScan) {
      const [current, legacy, inserted] = await Promise.all([
        client.getLogs({
          address: poolAddr as `0x${string}`,
          event: depositEvent,
          args: { commitment },
          fromBlock,
          toBlock,
        }),
        client.getLogs({
          address: poolAddr as `0x${string}`,
          event: depositEventLegacy,
          args: { commitment },
          fromBlock,
          toBlock,
        }),
        client.getLogs({
          address: poolAddr as `0x${string}`,
          event: commitmentInsertedEvent,
          args: { commitment },
          fromBlock,
          toBlock,
        }),
      ]);
      if (inserted.length > 0) {
        resolvedPool = poolAddr as `0x${string}`;
        const id = inserted[0]?.args?.denominationId;
        if (id !== undefined && id !== null) {
          const parsed = Number(id);
          if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 63) {
            denominationId = parsed;
          }
        }
        break;
      }
      if (current.length > 0 || legacy.length > 0) {
        resolvedPool = poolAddr as `0x${string}`;
        break;
      }
    }
  }

  if (!resolvedPool) {
    throw new Error(
      `Deposit tx succeeded but no Deposit/CommitmentInserted event for commitment ${commitment.slice(0, 12)}…`,
    );
  }

  return {
    ok: true,
    depositTx,
    blockNumber: String(receipt.blockNumber),
    poolAddress: resolvedPool,
    ...(denominationId !== undefined ? { denominationId } : {}),
  };
}

/**
 * Confirm a withdraw/claim: receipt success + Withdraw event, and/or nullifier spent.
 * Allows nullifier-only confirmation when the client lost the tx hash.
 */
export async function verifyClaimOnChain(params: {
  chainId: number;
  nullifier: string;
  txHash?: string | null;
  poolAddress?: string | null;
  tokenSymbol?: string | null;
}): Promise<ClaimVerification> {
  const config = CHAINS[params.chainId as SupportedChainId];
  if (!config || config.placeholder) {
    throw new Error(`Unsupported chain_id ${params.chainId}`);
  }

  const nullifier = normalizeHex32(params.nullifier);
  if (!nullifier) throw new Error("Invalid nullifier");

  const pool = resolvePoolAddress(config, params.poolAddress, params.tokenSymbol);
  const client = getClient(config);

  const nullifierUsed = (await client.readContract({
    address: pool,
    abi: nullifiersAbi,
    functionName: "nullifiers",
    args: [nullifier],
  })) as boolean;

  const txHashRaw = params.txHash?.trim() || null;
  const txHash = txHashRaw ? normalizeHex32(txHashRaw) : null;

  if (txHash) {
    let receipt: TransactionReceipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
    } catch {
      if (nullifierUsed) {
        return { ok: true, txHash, nullifierUsed: true };
      }
      throw new Error(`Claim tx not found on ${config.name}: ${txHash}`);
    }

    if (receipt.status !== "success") {
      if (nullifierUsed) {
        return { ok: true, txHash, nullifierUsed: true };
      }
      throw new Error(`Claim tx reverted on-chain: ${txHash}`);
    }

    const poolLower = pool.toLowerCase();
    const hasWithdraw = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== poolLower) return false;
      return nullifierFromWithdrawLog(log) === nullifier;
    });

    if (!hasWithdraw && !nullifierUsed) {
      // Decode via getLogs near the block (Standard Withdraw or Private WithdrawDenom).
      const fromBlock = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n;
      const [standard, denom] = await Promise.all([
        client.getLogs({
          address: pool,
          event: withdrawEvent,
          args: { nullifier },
          fromBlock,
          toBlock: receipt.blockNumber,
        }),
        client.getLogs({
          address: pool,
          event: withdrawDenomEvent,
          args: { nullifier },
          fromBlock,
          toBlock: receipt.blockNumber,
        }),
      ]);
      if (standard.length === 0 && denom.length === 0) {
        throw new Error(
          `Claim tx succeeded but nullifier ${nullifier.slice(0, 12)}… was not spent`,
        );
      }
    }

    return { ok: true, txHash, nullifierUsed: true };
  }

  if (!nullifierUsed) {
    throw new Error("Claim not confirmed on-chain (nullifier not spent)");
  }

  return { ok: true, txHash: null, nullifierUsed: true };
}
