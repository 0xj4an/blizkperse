// Denomination withdraw: prove note ownership; transfer amount is an allowlisted bucket.
// Public inputs (Solidity order): denomination_id, nullifier, merkle_proof_length,
//   expected_merkle_root, recipient.
// Private: value (must equal stables ladder[id]), pk_b, random, merkle path.
//
// Hash stack MUST stay aligned with deposit/withdraw/pay:
//   poseidon = v0.1.1 (`poseidon::bn254::hash_2`), binary_merkle_root-v0.0.1.
// Do not bump those deps without re-checking witness + regenerating all verifiers.
//
// Standard (arbitrary-amount) withdraw remains in withdraw.nr.
// Prover: WithdrawDenomProver.toml. Compile: ./scripts/compile_withdraw_denom_verifier.sh
use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::hash_2 as poseidon2;

pub global MAX_DEPTH: u32 = 10;
pub global DENOMINATION_COUNT: u32 = 11;

fn compute_entry(value: Field, holder: Field, random: Field, nullifier: Field) -> Field {
    poseidon2([poseidon2([value, holder]), poseidon2([random, nullifier])])
}

/// Fixed 6-decimal stables ladder (human * 10^6). Must match on-chain allowlist + web packer.
/// ids 0..9: 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000
/// id 10: 10 (small tip / 10 USDC bucket). Not used for COPm (COPm uses thousands ladder).
fn stables_denomination_amount(id: u32) -> Field {
    assert(id < DENOMINATION_COUNT);
    if id == 0 {
        50_000_000
    } else if id == 1 {
        100_000_000
    } else if id == 2 {
        250_000_000
    } else if id == 3 {
        500_000_000
    } else if id == 4 {
        1_000_000_000
    } else if id == 5 {
        2_500_000_000
    } else if id == 6 {
        5_000_000_000
    } else if id == 7 {
        10_000_000_000
    } else if id == 8 {
        25_000_000_000
    } else if id == 9 {
        50_000_000_000
    } else {
        // id == 10
        10_000_000
    }
}

fn main(
    // Public inputs (must match Solidity contract order)
    denomination_id: pub u32,
    nullifier: pub Field,
    merkle_proof_length: pub u32,
    expected_merkle_root: pub Field,
    recipient: pub Field,

    // Private inputs
    value: Field,
    pk_b: Field,
    random: Field,
    merkle_proof_indices: [u1; MAX_DEPTH],
    merkle_proof_siblings: [Field; MAX_DEPTH],
) {
    // 1. Bind private note value to allowlisted bucket (id stays public; raw value does not).
    assert(value == stables_denomination_amount(denomination_id));
    assert(value != 0);

    // 2. Nullifier proves ownership of the note
    assert(nullifier == poseidon2([random, pk_b]));

    // 3. Commitment inclusion in the pool Merkle tree
    let entry = compute_entry(value, pk_b, random, nullifier);
    let merkle_root = binary_merkle_root(
        poseidon2,
        entry,
        merkle_proof_length,
        merkle_proof_indices,
        merkle_proof_siblings,
    );
    assert(merkle_root == expected_merkle_root);

    // 4. Bind recipient to prevent front-running
    assert(recipient != 0);
}
