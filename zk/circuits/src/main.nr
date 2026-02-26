// Withdraw circuit: prove ownership of a note and bind withdrawal to a recipient.
// Public inputs (order for Solidity): value, nullifier, merkle_proof_length, expected_merkle_root, recipient.
// Prover: WithdrawProver.toml. Para compilar verifier: ./scripts/compile_withdraw_verifier.sh
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main(
    // Public inputs (must match Solidity contract order)
    value: pub Field,
    nullifier: pub Field,
    merkle_proof_length: pub u32,
    expected_merkle_root: pub Field,
    recipient: pub Field,

    // Private inputs (pk_b = recipient id, same as deposit_one: B=2, C=3)
    pk_b: Field,
    random: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
) {
    // 1. Verify nullifier is correctly derived (proves ownership of the note)
    assert(nullifier == poseidon2([random, pk_b]));

    // 2. Compute the commitment entry
    let entry = compute_entry(value, pk_b, random, nullifier);

    // 3. Verify merkle inclusion proof
    let merkle_root = binary_merkle_root(
        poseidon2,
        entry,
        merkle_proof_length,
        merkle_proof_indices,
        merkle_proof_siblings,
    );

    assert(merkle_root == expected_merkle_root);

    // 4. Constrain recipient to prevent front-running
    assert(recipient != 0);
}
