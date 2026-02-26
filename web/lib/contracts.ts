"use client";

import {
  createPublicClient,
  http,
  parseAbi,
  type WalletClient,
  type PublicClient,
  type Hash,
  type Hex,
  type Chain,
} from "viem";
import { type ChainConfig, type TokenConfig } from "./constants";

// ── Chain builder ───────────────────────────────────────

export function buildViemChain(config: ChainConfig): Chain {
  return {
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: {
      default: { name: config.explorerName, url: config.explorerUrl },
    },
  } as const satisfies Chain;
}

// ── ABI fragments ───────────────────────────────────────

// Pool ABI + WithdrawVerifier custom errors (revert bubbles from verifier.verify to pool.withdraw)
const POOL_ABI = parseAbi([
  "function deposit(bytes32 commitment) external",
  "function registerRoot(bytes32 root) external",
  "function transferIntent(bytes32 expectedRoot, bytes32 nullifierIn, uint32 merkleProofLength, bytes32 newCommitment, bytes proof) external",
  "function withdraw(bytes proof, bytes32[] publicInputs) external",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function nullifiers(bytes32) view returns (bool)",
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
  "event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment)",
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier)",
  "error ProofLengthWrong()",
  "error PublicInputsLengthWrong()",
  "error SumcheckFailed()",
  "error ShpleminiFailed()",
  "error GeminiChallengeInSubgroup()",
  "error ConsistencyCheckFailed()",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// ── Public client cache (one per chain) ─────────────────

const _clients = new Map<number, PublicClient>();

export function getPublicClient(config: ChainConfig): PublicClient {
  let client = _clients.get(config.id);
  if (!client) {
    client = createPublicClient({
      chain: buildViemChain(config),
      transport: http(config.rpcUrl),
    });
    _clients.set(config.id, client);
  }
  return client;
}

// ── Write functions ─────────────────────────────────────

export async function approvePoolToken(
  walletClient: WalletClient,
  config: ChainConfig,
  amount: bigint = config.poolDenomination,
): Promise<Hash> {
  return walletClient.writeContract({
    address: config.contracts.stablecoin,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [config.contracts.pool, amount],
    chain: buildViemChain(config),
  });
}

export async function depositToPool(
  walletClient: WalletClient,
  config: ChainConfig,
  commitment: Hex,
): Promise<Hash> {
  return walletClient.writeContract({
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "deposit",
    args: [commitment],
    chain: buildViemChain(config),
  });
}

export async function registerRoot(
  walletClient: WalletClient,
  config: ChainConfig,
  root: Hex,
): Promise<Hash> {
  return walletClient.writeContract({
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "registerRoot",
    args: [root],
    chain: buildViemChain(config),
  });
}

export async function withdrawFromPool(
  walletClient: WalletClient,
  config: ChainConfig,
  params: {
    proof: Hex;
    publicInputs: Hex[]; // [value, nullifier, merkleProofLength, expectedRoot, recipient]
  },
): Promise<Hash> {
  return walletClient.writeContract({
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "withdraw",
    args: [params.proof, params.publicInputs],
    chain: buildViemChain(config),
  });
}

// ── Read functions ──────────────────────────────────────

export async function isRootKnown(
  config: ChainConfig,
  root: Hex,
): Promise<boolean> {
  const client = getPublicClient(config);
  return client.readContract({
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "isKnownRoot",
    args: [root],
  }) as Promise<boolean>;
}

// ── Token balance helpers ────────────────────────────────

export async function getTokenBalance(
  config: ChainConfig,
  account: Hex,
  token: TokenConfig,
): Promise<bigint> {
  const client = getPublicClient(config);
  return client.readContract({
    address: token.address as Hex,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  }) as Promise<bigint>;
}

export async function getAllBalances(
  config: ChainConfig,
  account: Hex,
): Promise<Record<string, bigint>> {
  const results = await Promise.all(
    config.tokens.map(async (t) => {
      try {
        const bal = await getTokenBalance(config, account, t);
        return [t.symbol, bal] as const;
      } catch {
        return [t.symbol, 0n] as const;
      }
    }),
  );
  return Object.fromEntries(results);
}

// ── Event indexing ──────────────────────────────────────

const DEPOSIT_EVENT = {
  type: "event" as const,
  name: "Deposit" as const,
  inputs: [
    { type: "address" as const, indexed: true, name: "sender" as const },
    { type: "bytes32" as const, indexed: true, name: "commitment" as const },
  ],
};

/** Max block range per getLogs call — Monad rejects >= 1000 blocks */
const MAX_BLOCK_RANGE = BigInt(999);

export async function getDepositEvents(
  config: ChainConfig,
  fromBlock?: bigint,
) {
  const client = getPublicClient(config);
  const start = fromBlock ?? config.deployBlock;
  const latest = await client.getBlockNumber();

  // If range is small enough, single call
  if (latest - start <= MAX_BLOCK_RANGE) {
    return client.getLogs({
      address: config.contracts.pool,
      event: DEPOSIT_EVENT,
      fromBlock: start,
      toBlock: latest,
    });
  }

  // Paginate in chunks
  const allLogs: Awaited<ReturnType<typeof client.getLogs>>[] = [];
  let cursor = start;

  while (cursor <= latest) {
    const end = cursor + MAX_BLOCK_RANGE > latest ? latest : cursor + MAX_BLOCK_RANGE;
    const logs = await client.getLogs({
      address: config.contracts.pool,
      event: DEPOSIT_EVENT,
      fromBlock: cursor,
      toBlock: end,
    });
    allLogs.push(logs);
    cursor = end + 1n;
  }

  return allLogs.flat();
}
