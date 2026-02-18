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
import { MONAD_RPC_URL, POOL_ADDRESS, USDM_ADDRESS } from "./constants";

// ── Monad chain definition ──────────────────────────────
export const monadMainnet = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://monadexplorer.com",
    },
  },
} as const satisfies Chain;

// ── ABI fragments ───────────────────────────────────────
const POOL_ABI = parseAbi([
  "function deposit(bytes32 commitment) external",
  "function registerRoot(bytes32 root) external",
  "function transferIntent(bytes32 expectedRoot, bytes32 nullifierIn, uint32 merkleProofLength, bytes32 newCommitment, bytes proof) external",
  "function withdraw(bytes32 expectedRoot, bytes32 nullifierIn, uint32 merkleProofLength, bytes proof) external",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function nullifiers(bytes32) view returns (bool)",
  "event Deposit(address indexed sender, bytes32 indexed commitment)",
  "event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment)",
  "event Withdraw(address indexed recipient, bytes32 indexed nullifier)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// ── Public client (read-only singleton) ─────────────────
let _publicClient: PublicClient | null = null;
export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(MONAD_RPC_URL),
    });
  }
  return _publicClient;
}

// ── Constants ───────────────────────────────────────────
const DENOMINATION = 1_000_000n; // 1 USDm = 1e6

// ── Write functions ─────────────────────────────────────

export async function approveUSDm(
  walletClient: WalletClient,
  amount: bigint = DENOMINATION
): Promise<Hash> {
  return walletClient.writeContract({
    address: USDM_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [POOL_ADDRESS, amount],
    chain: monadMainnet,
  });
}

export async function depositToPool(
  walletClient: WalletClient,
  commitment: Hex
): Promise<Hash> {
  return walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "deposit",
    args: [commitment],
    chain: monadMainnet,
  });
}

export async function registerRoot(
  walletClient: WalletClient,
  root: Hex
): Promise<Hash> {
  return walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "registerRoot",
    args: [root],
    chain: monadMainnet,
  });
}

export async function withdrawFromPool(
  walletClient: WalletClient,
  params: {
    expectedRoot: Hex;
    nullifierIn: Hex;
    merkleProofLength: number;
    proof: Hex;
  }
): Promise<Hash> {
  return walletClient.writeContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "withdraw",
    args: [
      params.expectedRoot,
      params.nullifierIn,
      params.merkleProofLength,
      params.proof,
    ],
    chain: monadMainnet,
  });
}

// ── Read functions ──────────────────────────────────────

export async function isRootKnown(root: Hex): Promise<boolean> {
  const client = getPublicClient();
  return client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: "isKnownRoot",
    args: [root],
  }) as Promise<boolean>;
}

export async function getUSDmBalance(account: Hex): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: USDM_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  }) as Promise<bigint>;
}

export async function getUSDmAllowance(
  owner: Hex,
  spender: Hex = POOL_ADDRESS
): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: USDM_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  }) as Promise<bigint>;
}

// ── Event indexing ──────────────────────────────────────
export async function getDepositEvents(fromBlock?: bigint) {
  const client = getPublicClient();
  return client.getLogs({
    address: POOL_ADDRESS,
    event: {
      type: "event",
      name: "Deposit",
      inputs: [
        { type: "address", indexed: true, name: "sender" },
        { type: "bytes32", indexed: true, name: "commitment" },
      ],
    },
    fromBlock: fromBlock ?? 0n,
    toBlock: "latest",
  });
}
