// Helper: returns nullifier and expected_merkle_root for PAYMENT_INDEX=0 (pk_b=2, random=100).
// Run: ./scripts/run_nullifier_helper.sh then paste values into WithdrawProver.toml
use poseidon::poseidon::bn254::hash_2 as poseidon2;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main() -> pub (Field, Field) {
    let value = 1;
    let pk_b = 2;
    let random = 100;
    let nullifier = poseidon2([random, pk_b]);
    let entry = compute_entry(value, pk_b, random, nullifier);
    let sibling = 0;
    let root = poseidon2([entry, sibling]);
    (nullifier, root)
}
