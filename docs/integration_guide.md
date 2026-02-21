# Blizkperse Integration Guide (Frontend <-> ZK <-> Contract)

This guide details how to integrate the **Next.js Frontend** with the **ShieldedPool Contract** and **Noir ZK Circuits** found in the `zk/` directory.

---

## 1. Resources Checklist

*   **Chain Registry**: All chain configs, contract addresses, and token definitions live in `web/lib/constants.ts` as the `CHAINS` record.
*   **Contract Addresses (Monad Mainnet — Chain 143)**:
    *   `ShieldedPool`: `0x085BD9c0C568BE5093130E2359B00e46cb0800d1`
    *   `HonkVerifier`: `0xf7b2eC9EC33e34431F7f184458aE18Fa418271E3`
    *   `WithdrawVerifier`: `0xA465f96F9a0541D7392c5A22bBA7bc5f23e88f7c`
    *   `USDC`: `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals)
*   **Celo Mainnet (Chain 42220)**: Contracts not yet deployed (placeholder addresses).
*   **Circuit Artifact**: `web/public/circuits/circuit.json` (compiled from `zk/circuits/`)
*   **ABI**: Generate using `forge build` inside `zk/`.
*   **Deployment Artifact**: `zk/deployments/monad-mainnet/run-latest.json`

---

## 2. Multi-Chain Architecture

All contract interaction functions in `web/lib/contracts.ts` accept a `ChainConfig` parameter. The frontend resolves the active chain via the `useChain()` hook from `web/lib/chain-context.tsx`.

```typescript
import { useChain } from "@/lib/chain-context";

function MyComponent() {
  const { chain } = useChain();
  // chain.contracts.pool, chain.rpcUrl, chain.tokens, etc.
}
```

To add a new chain:
1. Add an entry to `CHAINS` in `web/lib/constants.ts`.
2. Add a CSS theme block in `web/app/globals.css` using `html[data-chain="slug"]`.
3. Deploy the ShieldedPool + Verifier contracts to the new chain.

---

## 3. Setup ZK in Frontend

We generate proofs in the browser using `@noir-lang/noir_js` and `@aztec/bb.js`.

### A. Dependencies
```bash
cd web
npm install @noir-lang/noir_js@1.0.0-beta.15 @aztec/bb.js@0.82.2
```

### B. Compile Circuit (Artifact Generation)
1.  Go to `zk/circuits`.
2.  Run `nargo compile`.
3.  Copy `target/with_foundry.json` to `web/public/circuits/circuit.json`.

### C. Proof Generation (`web/lib/zk.ts`)
The `generateProof()` function in `web/lib/zk.ts` handles circuit initialization and proof generation. It accepts a `ProofInput` object matching the circuit's public/private inputs.

```typescript
import { generateProof, fieldToHex, type ProofInput } from "@/lib/zk";

const proofInput: ProofInput = {
  new_commitment: "0x" + "0".repeat(64),
  nullifier_in: noteData.nullifier,
  merkle_proof_length: String(indices.length),
  expected_merkle_root: fieldToHex(root),
  value: noteData.value,
  pk_b: noteData.holder_pk,
  random: noteData.randomness,
  from: noteData.holder_pk,
  merkle_proof_indices: indices,
  merkle_proof_siblings: siblings.map((s: bigint) => fieldToHex(s)),
};
const proofResult = await generateProof(proofInput);
```

**Note**: Proof generation takes ~10-30 seconds in the browser. The build must use `--webpack` (not Turbopack) because `@aztec/bb.js` WASM requires `worker_threads`.

---

## 4. Contract Interactions

All contract functions live in `web/lib/contracts.ts` and accept a `ChainConfig` param.

### A. Payout (Deposit)
**User Action**: "Payer sends funds to recipients."

1.  **Frontend**:
    *   Generates a `secret` and `nullifier` for each recipient.
    *   Computes `commitment = Poseidon2(Poseidon2(value, holder), Poseidon2(random, nullifier))`.
2.  **Contract Call** (via viem):
    ```typescript
    import { approvePoolToken, depositToPool } from "@/lib/contracts";

    // Approve tokens
    await approvePoolToken(walletClient, chainConfig, amount);

    // Deposit commitment
    await depositToPool(walletClient, chainConfig, commitment);
    ```

### B. Claim (Withdraw)
**User Action**: "Recipient clicks Claim."

1.  **Frontend**:
    *   Builds Merkle tree from on-chain Deposit events via `buildTreeFromEvents(chainConfig)`.
    *   Gets Merkle proof for the recipient's commitment.
    *   Generates ZK proof via `generateProof(input)`.
    *   Optionally registers the Merkle root via `registerRoot(walletClient, chainConfig, root)`.
2.  **Contract Call**:
    ```typescript
    import { withdrawFromPool } from "@/lib/contracts";

    await withdrawFromPool(walletClient, chainConfig, proof);
    ```

---

## 5. Merkle Tree Management

The Merkle tree is built client-side from on-chain `Deposit` events.

```typescript
import { buildTreeFromEvents, rootToHex } from "@/lib/merkle";

const tree = await buildTreeFromEvents(chainConfig);
const leafIndex = tree.indexOf(commitmentBigInt);
const { siblings, indices, root } = await tree.getProof(leafIndex);
```

The `registerRoot` function submits the computed root to the contract so it can verify proofs against it.

---

## 6. Deployment Pipeline

1.  **Iterate Circuit**: Modify `main.nr` -> `nargo compile` -> Copy JSON to `web/public/circuits/`.
2.  **Iterate Contract**: Modify `.sol` -> `forge build` -> Copy ABI to Web.
3.  **Deploy contracts**: Use Foundry scripts for each target chain.
4.  **Update registry**: Add contract addresses to `CHAINS` in `web/lib/constants.ts`.
5.  **Deploy frontend**: Push `web/` to Railway.
