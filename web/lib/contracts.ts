"use client";

import {
  createPublicClient,
  http,
  parseAbi,
  decodeErrorResult,
  BaseError,
  ContractFunctionRevertedError,
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
  "error Error(string)", // require("msg") in ShieldedPool.deposit
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

function getWalletAccount(walletClient: WalletClient) {
  const { account } = walletClient;
  if (!account) {
    throw new Error("Wallet client account is not available");
  }
  return account;
}

// ── Write functions ─────────────────────────────────────

export async function approvePoolToken(
  walletClient: WalletClient,
  config: ChainConfig,
  amount: bigint = config.poolDenomination,
): Promise<Hash> {
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
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
    account: getWalletAccount(walletClient),
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "deposit",
    args: [commitment],
    chain: buildViemChain(config),
  });
}

/** Simulate deposit to get the contract revert reason (RPC/wallet often don't return it on writeContract). */
export async function getDepositRevertReason(
  config: ChainConfig,
  account: Hex,
  commitment: Hex,
): Promise<string | null> {
  const client = getPublicClient(config);
  try {
    await client.simulateContract({
      account,
      address: config.contracts.pool,
      abi: POOL_ABI,
      functionName: "deposit",
      args: [commitment],
    });
  } catch (err) {
    const decoded = decodeRevertDataFromError(err);
    if (decoded) return decoded;
    if (err instanceof BaseError) {
      const revertErr = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (revertErr instanceof ContractFunctionRevertedError && revertErr.data?.args?.[0])
        return String(revertErr.data.args[0]);
    }
  }
  return null;
}

/** Extract and decode Error(string) from any error that might contain revert data (e.g. RPC returns hex in data). */
export function decodeRevertDataFromError(err: unknown): string | null {
  const hex = getRevertDataHex(err);
  if (!hex || hex.length < 10) return null;
  try {
    const decoded = decodeErrorResult({ abi: POOL_ABI, data: hex as Hex });
    if (decoded.errorName === "Error" && decoded.args?.[0]) return String(decoded.args[0]);
  } catch {
    // not our error shape
  }
  return null;
}

function getRevertDataHex(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const o = err as Record<string, unknown>;
  if (typeof o.data === "string" && o.data.startsWith("0x")) return o.data;
  if (o.cause && typeof o.cause === "object") {
    const out = getRevertDataHex(o.cause);
    if (out) return out;
  }
  if (typeof o.details === "string" && o.details.startsWith("0x")) return o.details;
  const nested = o.error as Record<string, unknown> | undefined;
  if (nested && typeof nested.data === "string" && nested.data.startsWith("0x")) return nested.data;
  return null;
}

export async function registerRoot(
  walletClient: WalletClient,
  config: ChainConfig,
  root: Hex,
): Promise<Hash> {
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
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
    /** Optional: use when wallet nonce is stale (nonce too low). Fetch with getTransactionCount(account, 'pending'). */
    nonce?: number;
  },
): Promise<Hash> {
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "withdraw",
    args: [params.proof, params.publicInputs],
    chain: buildViemChain(config),
    ...(params.nonce !== undefined && { nonce: params.nonce }),
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

// ── Token balance / allowance helpers ───────────────────

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

/** Allowance of the pool's stablecoin from owner to the pool (for deposit pre-check). */
export async function getPoolAllowance(
  config: ChainConfig,
  owner: Hex,
): Promise<bigint> {
  const client = getPublicClient(config);
  return client.readContract({
    address: config.contracts.stablecoin,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, config.contracts.pool],
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

/** Max block range per getLogs call. Monad rejects >= 1000 blocks */
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
