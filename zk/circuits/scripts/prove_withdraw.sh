#!/bin/bash
# Generates a Honk/Barretenberg proof for the withdraw circuit.
# Requires: nargo, bb (Barretenberg CLI). WithdrawProver.toml with inputs.
# Usage: from circuits/ → ./scripts/prove_withdraw.sh
# Output: circuits/proofs/withdraw.proof (hex) and target/proof, target/public_inputs (binary).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak

# 1. Use withdraw as main
cp src/main.nr "$BACKUP" 2>/dev/null || true
cp src/withdraw.nr src/main.nr

# 2. Compile and generate witness
nargo compile
nargo execute -p WithdrawProver

# 3. Prove with bb (Barretenberg). Nargo saves the witness as target/<package>.gz (Nargo.toml name=with_foundry).
WITNESS_PATH=""
[ -f "./target/with_foundry.gz" ] && WITNESS_PATH="./target/with_foundry.gz"
[ -z "$WITNESS_PATH" ] && [ -f "./target/WithdrawProver" ] && WITNESS_PATH="./target/WithdrawProver"
[ -z "$WITNESS_PATH" ] && [ -f "./target/with_foundry-WithdrawProver" ] && WITNESS_PATH="./target/with_foundry-WithdrawProver"
if [ -z "$WITNESS_PATH" ] || ! [ -f "$WITNESS_PATH" ]; then
  echo "Witness not found. Searching in target/..."
  ls -la target/ 2>/dev/null || true
  echo "Adjust WITNESS_PATH in this script (e.g. ./target/with_foundry.gz) and re-run."
  mv "$BACKUP" src/main.nr 2>/dev/null || true
  exit 1
fi
echo "Using witness: $WITNESS_PATH"

# Write the withdraw circuit vk (target/vk) so bb prove and bb verify use the same key.
# Without this, target/vk could be from the transfer circuit and sumcheck fails.
bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak

bb prove -b ./target/with_foundry.json -w "$WITNESS_PATH" -o ./target --oracle_hash keccak

# 4. Convert binary proof to hex for withdraw_one.mjs
mkdir -p proofs
if [ -f ./target/proof ]; then
  node -e "
  const fs = require('fs');
  const p = fs.readFileSync('./target/proof');
  fs.writeFileSync('./proofs/withdraw.proof', '0x' + p.toString('hex'));
  console.log('Proof hex written to proofs/withdraw.proof,', p.length, 'bytes (', p.length/32, ' field elements)');
  "
else
  echo "target/proof not found. Check the output of 'bb prove'."
fi

# 5. Restore main.nr
mv "$BACKUP" src/main.nr 2>/dev/null || true

echo "Done. To submit the withdraw:"
echo "  Desde circuits/: PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs"
echo "  Desde repo root: PROOF_FILE=circuits/proofs/withdraw.proof node scripts/withdraw_one.mjs"
echo ""
echo "Verificar proof localmente con bb: bb verify -p ./target/proof -k ./target/vk -i ./target/public_inputs --oracle_hash keccak"
