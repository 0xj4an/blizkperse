use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

#[export]
fn calc_root(
    value: Field,
    from: Field,
    random: Field,
    nullifier_in: Field,
    merkle_proof_length: u32,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
) -> Field {
    let entry_in = compute_entry(value, from, random, nullifier_in);

    binary_merkle_root(
        poseidon2,
        entry_in,
        merkle_proof_length,
        merkle_proof_indices,
        merkle_proof_siblings,
    )
}
