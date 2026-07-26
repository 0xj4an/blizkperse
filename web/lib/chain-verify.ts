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
const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount)",
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
};

export type ClaimVerification = {
  ok: true;
  txHash: string | null;
  nullifierUsed: boolean;
};

/**
 * Confirm a deposit landed: receipt success + Deposit event with matching commitment.
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

  const pool = resolvePoolAddress(config, params.poolAddress, params.tokenSymbol);
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

  const poolLower = pool.toLowerCase();
  const routerLower = config.router?.toLowerCase?.() ?? "";

  const matchingLogs = receipt.logs.filter((log) => {
    const addr = log.address.toLowerCase();
    if (addr !== poolLower && addr !== routerLower) return false;
    const c = commitmentFromLog(log);
    return c === commitment;
  });

  // Fallback: decode via getLogs around the receipt block (in case topic layout differs).
  if (matchingLogs.length === 0) {
    const fromBlock = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n;
    const toBlock = receipt.blockNumber;
    const [current, legacy] = await Promise.all([
      client.getLogs({
        address: pool,
        event: depositEvent,
        args: { commitment },
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: pool,
        event: depositEventLegacy,
        args: { commitment },
        fromBlock,
        toBlock,
      }),
    ]);
    if (current.length === 0 && legacy.length === 0) {
      throw new Error(
        `Deposit tx succeeded but no Deposit event for commitment ${commitment.slice(0, 12)}…`,
      );
    }
  }

  return {
    ok: true,
    depositTx,
    blockNumber: String(receipt.blockNumber),
    poolAddress: pool,
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
      // Decode via getLogs near the block
      const fromBlock = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n;
      const logs = await client.getLogs({
        address: pool,
        event: withdrawEvent,
        args: { nullifier },
        fromBlock,
        toBlock: receipt.blockNumber,
      });
      if (logs.length === 0) {
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
