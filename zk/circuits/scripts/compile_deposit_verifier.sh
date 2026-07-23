#!/bin/bash
# Compiles the deposit circuit and generates DepositVerifier.sol.
# Usage: from circuits/ → ./scripts/compile_deposit_verifier.sh
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
PACKAGE_NAME="deposit_circuit"

cleanup() {
  local exit_code=$?
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" src/main.nr
  fi
  # Restore package name if we changed it
  if [ -f Nargo.toml.bak ]; then
    mv Nargo.toml.bak Nargo.toml
  fi
  trap - EXIT INT TERM
  if [ $exit_code -ne 0 ]; then
    echo "compile_deposit_verifier.sh failed with exit code $exit_code (main.nr restored)."
    exit $exit_code
  fi
}

trap cleanup EXIT INT TERM

if [ -f "$BACKUP" ]; then
  echo "Found stale backup at $BACKUP. Restoring it before continuing."
  mv "$BACKUP" src/main.nr
fi

echo "Using nargo: $(nargo --version | head -n 1)"
echo "Using bb: $(bb --version 2>/dev/null || echo 'not found')"

cp src/main.nr "$BACKUP"
cp src/deposit.nr src/main.nr

# Compile under a distinct artifact name so we don't overwrite with_foundry.json
cp Nargo.toml Nargo.toml.bak
sed -i.bak 's/name="with_foundry"/name="deposit_circuit"/' Nargo.toml 2>/dev/null || \
  sed -i '' 's/name="with_foundry"/name="deposit_circuit"/' Nargo.toml

nargo compile

ARTIFACT="./target/${PACKAGE_NAME}.json"
if [ ! -f "$ARTIFACT" ]; then
  ARTIFACT="./target/with_foundry.json"
fi

# Prefer bb.js aligned with web/@aztec/bb.js (CLI bb often lags and throws "Length is too large").
echo "Generating deposit verifier with bb.js (matches noir_js / @aztec/bb.js)..."
if node ./scripts/generate_deposit_verifier_bbjs.mjs; then
  echo "Deposit verifier generated with bb.js."
elif bb write_vk -b "$ARTIFACT" -o ./target/deposit_vk --oracle_hash keccak && \
   bb write_solidity_verifier -k ./target/deposit_vk/vk -o ./target/DepositVerifier.sol; then
  echo "Deposit verifier generated with bb CLI (fallback)."
elif bb write_vk -b "$ARTIFACT" -o ./target --oracle_hash keccak && \
     bb write_solidity_verifier -k ./target/vk -o ./target/DepositVerifier.sol; then
  echo "Deposit verifier generated with bb CLI (shared target dir)."
else
  echo "Failed to generate DepositVerifier.sol"
  exit 1
fi

mkdir -p ../contract
# Rename contract HonkVerifier -> DepositHonkVerifier to avoid clashes
if grep -q "contract DepositHonkVerifier" ./target/DepositVerifier.sol; then
  cp ./target/DepositVerifier.sol ../contract/DepositVerifier.sol
elif grep -q "contract HonkVerifier" ./target/DepositVerifier.sol; then
  sed 's/contract HonkVerifier/contract DepositHonkVerifier/g' ./target/DepositVerifier.sol > ../contract/DepositVerifier.sol
elif grep -q "contract UltraVerifier" ./target/DepositVerifier.sol; then
  sed 's/contract UltraVerifier/contract DepositHonkVerifier/g' ./target/DepositVerifier.sol > ../contract/DepositVerifier.sol
else
  cp ./target/DepositVerifier.sol ../contract/DepositVerifier.sol
  echo "Warning: could not auto-rename verifier contract; check DepositVerifier.sol"
fi

# Ensure IVerifier import compatibility for ShieldedPool
if ! grep -q "interface IVerifier" ../contract/DepositVerifier.sol; then
  # Prepend minimal IVerifier if missing (bb output usually has BaseHonkVerifier with verify)
  :
fi

if command -v shasum >/dev/null 2>&1; then
  FINGERPRINT=$(shasum -a 256 "$ARTIFACT" | cut -d' ' -f1)
else
  FINGERPRINT=$(sha256sum "$ARTIFACT" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
fi
echo "$FINGERPRINT" > .deposit-verifier-build-id
echo "$FINGERPRINT" > ../contract/.deposit-verifier-build-id
echo "Deposit verifier build ID: $FINGERPRINT"
echo "Done. contract/DepositVerifier.sol generated."
