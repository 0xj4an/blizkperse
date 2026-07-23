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
import { type ChainConfig, type TokenConfig, getPoolConfig } from "./constants";

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

const ROUTER_ABI = parseAbi([
  "function deposit(address token, bytes32 commitment, uint256 amount, bytes proof, bytes32[] publicInputs) external",
  "function depositNative(bytes32 commitment, bytes proof, bytes32[] publicInputs) payable",
  "function withdraw(address token, bytes proof, bytes32[] publicInputs, bool unwrap) external",
  "function poolOf(address token) view returns (address)",
  "function wrappedNative() view returns (address)",
  "event RoutedDeposit(address indexed user, address indexed token, address indexed pool, bytes32 commitment, uint256 amount)",
  "event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount)",
]);

const POOL_ABI = parseAbi([
  "function deposit(bytes32 commitment, uint256 amount, bytes proof, bytes32[] publicInputs) external",
  "function registerRoot(bytes32 root) external",
  "function withdraw(bytes proof, bytes32[] publicInputs) external",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function nullifiers(bytes32) view returns (bool)",
  "event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount)",
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount)",
  "error ProofLengthWrong()",
  "error ProofLengthWrongWithLogN(uint256 logN, uint256 actualLength, uint256 expectedLength)",
  "error PublicInputsLengthWrong()",
  "error SumcheckFailed()",
  "error ShpleminiFailed()",
  "error Error(string)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

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

function routerAddress(config: ChainConfig): `0x${string}` {
  if (!config.router || config.router === "0x0000000000000000000000000000000000000000") {
    throw new Error(`PoolRouter not configured for ${config.name}. Set NEXT_PUBLIC_*_ROUTER_ADDRESS.`);
  }
  return config.router;
}

/** Approve ERC-20 spending for the router (entrypoint). */
export async function approveRouterToken(
  walletClient: WalletClient,
  config: ChainConfig,
  token: TokenConfig,
  amount: bigint,
): Promise<Hash> {
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: token.address,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [routerAddress(config), amount],
    chain: buildViemChain(config),
  });
}

/** @deprecated Prefer approveRouterToken */
export async function approvePoolToken(
  walletClient: WalletClient,
  config: ChainConfig,
  amount: bigint = config.poolDenomination,
): Promise<Hash> {
  return approveRouterToken(walletClient, config, config.defaultToken, amount);
}

export async function depositViaRouter(
  walletClient: WalletClient,
  config: ChainConfig,
  params: {
    tokenSymbol: string;
    commitment: Hex;
    amount: bigint;
    proof: Hex;
    publicInputs: Hex[];
    /** Use native payable path when depositing wrapped-native via msg.value */
    useNative?: boolean;
  },
): Promise<Hash> {
  const poolCfg = getPoolConfig(config, params.tokenSymbol);
  const account = getWalletAccount(walletClient);
  const chain = buildViemChain(config);

  if (params.useNative || poolCfg.token.wrapsNative) {
    return walletClient.writeContract({
      account,
      address: routerAddress(config),
      abi: ROUTER_ABI,
      functionName: "depositNative",
      args: [params.commitment, params.proof, params.publicInputs],
      value: params.amount,
      chain,
    });
  }

  return walletClient.writeContract({
    account,
    address: routerAddress(config),
    abi: ROUTER_ABI,
    functionName: "deposit",
    args: [
      poolCfg.token.address,
      params.commitment,
      params.amount,
      params.proof,
      params.publicInputs,
    ],
    chain,
  });
}

/** @deprecated Direct pool deposit without proof — use depositViaRouter */
export async function depositToPool(
  walletClient: WalletClient,
  config: ChainConfig,
  commitment: Hex,
  amount: bigint = config.poolDenomination,
  proof: Hex = "0x",
  publicInputs: Hex[] = [],
): Promise<Hash> {
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: config.contracts.pool,
    abi: POOL_ABI,
    functionName: "deposit",
    args: [commitment, amount, proof, publicInputs],
    chain: buildViemChain(config),
  });
}

export async function getDepositRevertReason(
  config: ChainConfig,
  account: Hex,
  commitment: Hex,
  amount: bigint,
  proof: Hex,
  publicInputs: Hex[],
  tokenSymbol?: string,
): Promise<string | null> {
  const client = getPublicClient(config);
  const symbol = tokenSymbol ?? config.defaultToken.symbol;
  const poolCfg = getPoolConfig(config, symbol);
  try {
    if (poolCfg.token.wrapsNative) {
      await client.simulateContract({
        account,
        address: routerAddress(config),
        abi: ROUTER_ABI,
        functionName: "depositNative",
        args: [commitment, proof, publicInputs],
        value: amount,
      });
    } else {
      await client.simulateContract({
        account,
        address: routerAddress(config),
        abi: ROUTER_ABI,
        functionName: "deposit",
        args: [poolCfg.token.address, commitment, amount, proof, publicInputs],
      });
    }
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
  tokenSymbol?: string,
): Promise<Hash> {
  const pool = tokenSymbol
    ? getPoolConfig(config, tokenSymbol).pool
    : config.contracts.pool;
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: pool,
    abi: POOL_ABI,
    functionName: "registerRoot",
    args: [root],
    chain: buildViemChain(config),
  });
}

export async function withdrawViaRouter(
  walletClient: WalletClient,
  config: ChainConfig,
  params: {
    tokenSymbol: string;
    proof: Hex;
    publicInputs: Hex[];
    unwrap?: boolean;
    nonce?: number;
  },
): Promise<Hash> {
  const poolCfg = getPoolConfig(config, params.tokenSymbol);
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: routerAddress(config),
    abi: ROUTER_ABI,
    functionName: "withdraw",
    args: [poolCfg.token.address, params.proof, params.publicInputs, Boolean(params.unwrap)],
    chain: buildViemChain(config),
    ...(params.nonce !== undefined && { nonce: params.nonce }),
  });
}

export async function withdrawFromPool(
  walletClient: WalletClient,
  config: ChainConfig,
  params: {
    proof: Hex;
    publicInputs: Hex[];
    nonce?: number;
    tokenSymbol?: string;
  },
): Promise<Hash> {
  if (params.tokenSymbol && config.router && config.router !== "0x0000000000000000000000000000000000000000") {
    return withdrawViaRouter(walletClient, config, {
      tokenSymbol: params.tokenSymbol,
      proof: params.proof,
      publicInputs: params.publicInputs,
      unwrap: false,
      nonce: params.nonce,
    });
  }
  const pool = params.tokenSymbol
    ? getPoolConfig(config, params.tokenSymbol).pool
    : config.contracts.pool;
  return walletClient.writeContract({
    account: getWalletAccount(walletClient),
    address: pool,
    abi: POOL_ABI,
    functionName: "withdraw",
    args: [params.proof, params.publicInputs],
    chain: buildViemChain(config),
    ...(params.nonce !== undefined && { nonce: params.nonce }),
  });
}

export async function isRootKnown(
  config: ChainConfig,
  root: Hex,
  tokenSymbol?: string,
): Promise<boolean> {
  const client = getPublicClient(config);
  const pool = tokenSymbol
    ? getPoolConfig(config, tokenSymbol).pool
    : config.contracts.pool;
  return client.readContract({
    address: pool,
    abi: POOL_ABI,
    functionName: "isKnownRoot",
    args: [root],
  }) as Promise<boolean>;
}

export async function getTokenBalance(
  config: ChainConfig,
  account: Hex,
  token: TokenConfig,
): Promise<bigint> {
  if (token.wrapsNative) {
    const client = getPublicClient(config);
    return client.getBalance({ address: account });
  }
  const client = getPublicClient(config);
  return client.readContract({
    address: token.address as Hex,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  }) as Promise<bigint>;
}

export async function getPoolAllowance(
  config: ChainConfig,
  owner: Hex,
  token?: TokenConfig,
): Promise<bigint> {
  const t = token ?? config.defaultToken;
  if (t.wrapsNative) return 0n;
  const client = getPublicClient(config);
  const spender =
    config.router && config.router !== "0x0000000000000000000000000000000000000000"
      ? config.router
      : config.contracts.pool;
  return client.readContract({
    address: t.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
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

const DEPOSIT_EVENT = {
  type: "event" as const,
  name: "Deposit" as const,
  inputs: [
    { type: "address" as const, indexed: true, name: "depositor" as const },
    { type: "bytes32" as const, indexed: true, name: "commitment" as const },
    { type: "uint256" as const, indexed: false, name: "amount" as const },
  ],
};

/** Legacy Deposit(sender, commitment) without amount */
const DEPOSIT_EVENT_LEGACY = {
  type: "event" as const,
  name: "Deposit" as const,
  inputs: [
    { type: "address" as const, indexed: true, name: "sender" as const },
    { type: "bytes32" as const, indexed: true, name: "commitment" as const },
  ],
};

const MAX_BLOCK_RANGE = BigInt(99);

export async function getDepositEvents(
  config: ChainConfig,
  fromBlock?: bigint,
  poolAddress?: `0x${string}`,
) {
  const client = getPublicClient(config);
  const start = fromBlock ?? config.deployBlock;
  const latest = await client.getBlockNumber();
  const address = poolAddress ?? config.contracts.pool;

  async function fetchRange(from: bigint, to: bigint) {
    try {
      return await client.getLogs({
        address,
        event: DEPOSIT_EVENT,
        fromBlock: from,
        toBlock: to,
      });
    } catch {
      return client.getLogs({
        address,
        event: DEPOSIT_EVENT_LEGACY,
        fromBlock: from,
        toBlock: to,
      });
    }
  }

  if (latest - start <= MAX_BLOCK_RANGE) {
    return fetchRange(start, latest);
  }

  const allLogs: Awaited<ReturnType<typeof fetchRange>>[] = [];
  let cursor = start;
  while (cursor <= latest) {
    const end = cursor + MAX_BLOCK_RANGE > latest ? latest : cursor + MAX_BLOCK_RANGE;
    allLogs.push(await fetchRange(cursor, end));
    cursor = end + 1n;
  }
  return allLogs.flat();
}
