#!/bin/bash
# Compiles the withdraw circuit and generates WithdrawVerifier.sol.
# Usage: from circuits/ → ./scripts/compile_withdraw_verifier.sh
# Steps: saves main.nr, uses withdraw.nr as main, nargo compile,
#        generates Verifier.sol with bb CLI or bb.js fallback,
#        fingerprints the artifact, runs a non-blocking smoke test, then restores main.nr.
# IMPORTANT: The API (web/app/api/generate-proof) must use the SAME proof target: EVM / keccak-compatible output.
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
VERIFIER_MODE="bb"

cleanup() {
  local exit_code=$?
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" src/main.nr
  fi
  if [ $exit_code -ne 0 ]; then
    echo "compile_withdraw_verifier.sh failed with exit code $exit_code (main.nr restored)."
  fi
  trap - EXIT INT TERM
  if [ $exit_code -ne 0 ]; then
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
cp src/withdraw.nr src/main.nr
nargo compile

echo "Generating verifier with bb CLI..."
if bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak && \
   bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol; then
  echo "Verifier generated with bb CLI."
else
  echo "bb CLI verifier generation failed. Falling back to bb.js..."
  rm -f ./target/vk ./target/Verifier.sol
  node ./scripts/generate_withdraw_verifier_bbjs.mjs
  VERIFIER_MODE="bbjs"
fi

# Fingerprint: same build = same artifact (prevents deploying verifier from a different compilation)
if command -v shasum >/dev/null 2>&1; then
  FINGERPRINT=$(shasum -a 256 ./target/with_foundry.json | cut -d' ' -f1)
else
  FINGERPRINT=$(sha256sum ./target/with_foundry.json 2>/dev/null | cut -d' ' -f1 || echo "unknown")
fi
echo "$FINGERPRINT" > .verifier-build-id
mkdir -p ../contract
echo "$FINGERPRINT" > ../contract/.verifier-build-id
cp target/Verifier.sol ../contract/WithdrawVerifier.sol
rm -f target/Verifier.sol
echo "Verifier build ID: $FINGERPRINT (saved in .verifier-build-id and contract/.verifier-build-id)"

if [ "$VERIFIER_MODE" = "bb" ]; then
  if [ -f WithdrawProver.toml ]; then
    echo "Smoke test (CLI): generating proof with nargo + bb..."
    if nargo execute -p WithdrawProver 2>/dev/null || nargo execute 2>/dev/null; then
      WITNESS_PATH=""
      [ -f "./target/with_foundry.gz" ] && WITNESS_PATH="./target/with_foundry.gz"
      [ -z "$WITNESS_PATH" ] && [ -f "./target/WithdrawProver" ] && WITNESS_PATH="./target/WithdrawProver"
      [ -z "$WITNESS_PATH" ] && [ -f "./target/with_foundry-WithdrawProver" ] && WITNESS_PATH="./target/with_foundry-WithdrawProver"
      if [ -n "$WITNESS_PATH" ] && [ -f "$WITNESS_PATH" ]; then
        if bb prove -b ./target/with_foundry.json -w "$WITNESS_PATH" -o ./target --oracle_hash keccak && \
           bb verify -p ./target/proof -k ./target/vk -i ./target/public_inputs --oracle_hash keccak; then
          echo "Smoke test: proof verified OK."
        else
          echo "Warning: CLI smoke test failed. Verifier was still generated."
        fi
      else
        echo "Warning: witness not found, skip CLI smoke test."
      fi
    else
      echo "Warning: nargo execute failed, skip CLI smoke test."
    fi
  else
    echo "Warning: WithdrawProver.toml not found, skip CLI smoke test."
  fi
else
  echo "Smoke test (bb.js) already ran during fallback generation."
fi

echo "Done. contract/WithdrawVerifier.sol generated via ${VERIFIER_MODE}. Redeploy the contract and update the pool if the verifier address changes."
