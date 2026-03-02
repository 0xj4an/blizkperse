// Helper: expected_merkle_root and merkle_proof_siblings using same Poseidon as main/withdraw.
// Tree depth 10, single leaf (entry) at index 0; rest leaves = 0.
// Run: ./scripts/run_merkle_root_helper.sh then paste root + siblings into WithdrawProver.toml
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main() -> pub (Field, [Field; MAX_DEPTH]) {
    let value = 1;
    let pk_b = 2;
    let random = 100;
    let nullifier = poseidon2([random, pk_b]);
    let entry = compute_entry(value, pk_b, random, nullifier);

    // Zero hashes per level: H(0,0), H(H(0,0), H(0,0)), ...
    let mut zero_hash: [Field; MAX_DEPTH] = [0; MAX_DEPTH];
    zero_hash[0] = 0;
    for i in 1..MAX_DEPTH {
        zero_hash[i] = poseidon2([zero_hash[i - 1], zero_hash[i - 1]]);
    }

    // Siblings for leaf at index 0 (always left child): s[0]=0, s[i]=zero_hash[i]
    let mut siblings: [Field; MAX_DEPTH] = [0; MAX_DEPTH];
    siblings[0] = 0;
    for i in 1..MAX_DEPTH {
        siblings[i] = zero_hash[i];
    }

    // Root: climb from entry with indices=0 (left) => parent = H(current_node, sibling)
    let mut node = entry;
    for i in 0..MAX_DEPTH {
        node = poseidon2([node, siblings[i]]);
    }
    let root = node;

    (root, siblings)
}
