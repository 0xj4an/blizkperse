"use client";

import { poseidon2, bigintToBytes32 } from "./zk";
import type { ChainConfig } from "./constants";
import type { Hex } from "viem";

const MAX_DEPTH = 10;

/**
 * Binary Merkle tree using Poseidon2.
 * Matches the circuit's `binary_merkle_root` library.
 * Max capacity: 2^10 = 1024 leaves.
 */
export class MerkleTree {
  private leaves: bigint[] = [];
  private depth: number;

  constructor(depth: number = MAX_DEPTH) {
    this.depth = depth;
  }

  insert(leaf: bigint) {
    if (this.leaves.length >= 2 ** this.depth) {
      throw new Error("Merkle tree is full");
    }
    this.leaves.push(leaf);
  }

  getLeaves(): bigint[] {
    return [...this.leaves];
  }

  indexOf(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  get size(): number {
    return this.leaves.length;
  }

  async computeRoot(): Promise<bigint> {
    if (this.leaves.length === 0) return 0n;

    const size = 2 ** this.depth;
    const paddedLeaves = [...this.leaves];
    while (paddedLeaves.length < size) {
      paddedLeaves.push(0n);
    }

    let currentLevel = paddedLeaves;
    for (let d = 0; d < this.depth; d++) {
      const nextLevel: bigint[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const hash = await poseidon2(currentLevel[i], currentLevel[i + 1]);
        nextLevel.push(hash);
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  async getProof(leafIndex: number): Promise<{
    siblings: bigint[];
    indices: number[];
    root: bigint;
  }> {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Invalid leaf index: ${leafIndex}`);
    }

    const size = 2 ** this.depth;
    const paddedLeaves = [...this.leaves];
    while (paddedLeaves.length < size) {
      paddedLeaves.push(0n);
    }

    const siblings: bigint[] = [];
    const indices: number[] = [];

    let currentLevel = paddedLeaves;
    let idx = leafIndex;

    for (let d = 0; d < this.depth; d++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      siblings.push(currentLevel[siblingIdx]);
      indices.push(idx % 2); // 0 = left child, 1 = right child

      const nextLevel: bigint[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const hash = await poseidon2(currentLevel[i], currentLevel[i + 1]);
        nextLevel.push(hash);
      }
      currentLevel = nextLevel;
      idx = Math.floor(idx / 2);
    }

    return {
      siblings,
      indices,
      root: currentLevel[0],
    };
  }
}

/**
 * Builds a merkle tree from on-chain Deposit events.
 * Uses server-side API for parallel event scanning (RPC block range limits).
 */
export async function buildTreeFromEvents(
  config: ChainConfig,
  opts?: { tokenSymbol?: string; poolAddress?: `0x${string}` },
): Promise<MerkleTree> {
  if (config.placeholder) {
    throw new Error(`Contracts not deployed on ${config.name} yet`);
  }

  const params = new URLSearchParams({ chain_id: String(config.id) });
  if (opts?.poolAddress) params.set("pool_address", opts.poolAddress);
  if (opts?.tokenSymbol) params.set("token_symbol", opts.tokenSymbol);

  const res = await fetch(`/api/deposit-events?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Failed to fetch deposit events (${res.status})`);
  }

  const events: { commitment: string }[] = await res.json();
  const tree = new MerkleTree(MAX_DEPTH);

  for (const event of events) {
    tree.insert(BigInt(event.commitment));
  }

  return tree;
}

export function rootToHex(root: bigint): Hex {
  return bigintToBytes32(root);
}
