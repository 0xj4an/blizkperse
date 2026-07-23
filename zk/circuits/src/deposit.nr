// Deposit circuit: prove commitment binds (value, pk_b, random, nullifier).
// Public inputs (order for Solidity): value, commitment.
// Used by ShieldedPool.deposit to prevent amount/commitment mismatch drains.
use poseidon::poseidon::bn254::hash_2 as poseidon2;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main(
    // Public inputs (must match Solidity contract order)
    value: pub Field,
    commitment: pub Field,

    // Private inputs
    pk_b: Field,
    random: Field,
    nullifier: Field,
) {
    assert(nullifier == poseidon2([random, pk_b]));
    let entry = compute_entry(value, pk_b, random, nullifier);
    assert(commitment == entry);
    assert(value != 0);
}
