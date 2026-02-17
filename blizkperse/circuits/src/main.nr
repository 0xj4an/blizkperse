mod root_helper;
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

fn main(
    // PUBLIC (onchain)
    new_commitment: pub Field,
    nullifier_in: pub Field,
    merkle_proof_length: pub u32,
    expected_merkle_root: pub Field,

    // PRIVATE (witness)
    value: Field,
    pk_b: Field,
    random: Field,
    from: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
){
    // output nullifier for the NEW note (kept private until it is spent)
    let nullifier_out = poseidon2([random, pk_b]);

    // input note commitment
    let entry_in = compute_entry(value, from, random, nullifier_in);

    // output note commitment
    let entry_out = compute_entry(value, pk_b, random, nullifier_out);

    // membership proof
    let merkle_root = binary_merkle_root(
        poseidon2,
        entry_in,
        merkle_proof_length,
        merkle_proof_indices,
        merkle_proof_siblings,
    );
    assert(merkle_root == expected_merkle_root);
    // bind the proof to the onchain commitment insertion
    assert(entry_out == new_commitment);
}
