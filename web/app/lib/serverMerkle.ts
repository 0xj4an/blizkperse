/**
 * Server-side Poseidon2 Merkle tree (matches zk circuits + web/lib/merkle.ts).
 * Kept separate from the client module so API routes can import without "use client".
 */
import { poseidon2 as poseidonHash } from "@/lib/poseidon2-hash";

const MAX_DEPTH = 10;

async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  return poseidonHash([a, b]);
}

export class ServerMerkleTree {
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
        nextLevel.push(await poseidon2(currentLevel[i], currentLevel[i + 1]));
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }
}

export function bigintToBytes32(x: bigint): `0x${string}` {
  return `0x${x.toString(16).padStart(64, "0")}`;
}
