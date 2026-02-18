# Blizkperse Integration Guide (Frontend <-> ZK <-> Contract)

This guide details how to integrate the **Next.js Frontend** with the **ShieldedPool Contract** and **Noir ZK Circuits** found in the `blizkperse/` directory.

---

## 1. Resources Checklist

*   **Contract Address (Monad Mainnet)**:
    *   `ShieldedPool`: `0x35C8F36a031389f469372C370dA3Cb46Dd69265a`
    *   `Verifier`: `0x1d42C0cD5fF14Ee71456473828996b1bC251a735`
*   **Circuit Source**: `blizkperse/circuits/src/main.nr`
*   **ABI**: Generate using `forge build` inside `blizkperse/`.

---

## 2. Setup ZK in Frontend

We need to generate proofs in the browser.

### A. Install Dependencies
```bash
cd web
npm install @noir-lang/noir_js @noir-lang/backend_barretenberg
```

### B. Compile Circuit (Artifact Generation)
You need the compiled JSON of the circuit to load it in the browser.
1.  Go to `blizkperse/circuits`.
2.  Run `nargo compile`.
3.  Copy `target/main.json` to `web/public/circuits/main.json`.

---

## 3. Generating Proofs (Client-Side)

Create a helper `lib/zk.ts` to handle proof generation.

```typescript
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import circuit from '../../public/circuits/main.json';

export async function generateWithdrawProof(input: any) {
  const backend = new BarretenbergBackend(circuit);
  const noir = new Noir(circuit, backend);

  // Input must match main.nr arguments
  // { new_commitment, nullifier_in, merkle_proof_length, expected_merkle_root, value, pk_b, ... }
  const { witness } = await noir.execute(input);
  const proof = await backend.generateProof(witness);
  
  return proof;
}
```

---

## 4. Contract Interactions

### A. Payout (Deposit)
**User Action**: "Payer sends funds to 5 users."

1.  **Frontend**:
    *   Generates a `secret` and `nullifier` for each recipient (or fetches their registered public key).
    *   Computes `commitment = Poseidon(amount, pubKey, randomness)`.
2.  **Wagmi Call**:
    ```typescript
    writeContract({
      address: '0x35C8...', // ShieldedPool
      abi: ShieldedPoolABI,
      functionName: 'deposit',
      args: [commitment] // Loop for multiple deposits if needed
    })
    ```

### B. Claim (Withdraw)
**User Action**: "Recipient clicks Claim."

1.  **Frontend**:
    *   Fetches the Merkle Path for their note (from an Indexer or RPC queries).
    *   Constructs the `input` object for the circuit.
    *   Calls `generateWithdrawProof(input)`.
2.  **Wagmi Call**:
    ```typescript
    writeContract({
      address: '0x35C8...', // ShieldedPool
      abi: ShieldedPoolABI,
      functionName: 'withdraw',
      args: [
        root,
        nullifier,
        merkleProofLength,
        proof
      ]
    })
    ```

---

## 5. Merkle Tree Management (The Hard Part)

Since we are on Mainnet, we need to know the **Merkle Root** and **Path** to prove membership.
*   **Option A (Easy/MVP)**: Use `registerRoot` in the contract.
*   **Option B (Pro)**: Build a simple Indexer (using GhostGraph or subquery) that listens to `Deposit` events and builds the tree off-chain to serve paths to the frontend.

---

## 6. Deployment Pipeline

1.  **Iterate Circuit**: Modify `main.nr` -> `nargo compile` -> Copy JSON to Web.
2.  **Iterate Contract**: Modify `.sol` -> `forge build` -> Copy ABI to Web.
3.  **Deploy**: Push `web/` to Railway.
