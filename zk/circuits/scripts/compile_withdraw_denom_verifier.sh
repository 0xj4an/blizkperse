#!/bin/bash
# Compiles the denomination withdraw circuit and generates WithdrawDenomVerifier.sol.
# Usage: from circuits/ → ./scripts/compile_withdraw_denom_verifier.sh
# Does NOT overwrite WithdrawVerifier.sol (arbitrary-amount / Standard path).
# IMPORTANT: Keep poseidon + binary_merkle_root tags in Nargo.toml unchanged unless
# you intentionally regenerate ALL verifiers and re-check JS poseidon-lite witnesses.
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
    echo "compile_withdraw_denom_verifier.sh failed with exit code $exit_code (main.nr restored)."
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
cp src/withdraw_denom.nr src/main.nr
nargo compile

echo "Generating denomination withdraw verifier with bb CLI..."
if bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak && \
   bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol; then
  echo "Verifier generated with bb CLI."
else
  echo "bb CLI verifier generation failed. Falling back to bb.js..."
  rm -f ./target/vk ./target/Verifier.sol
  WITHDRAW_INPUTS_FILE="./withdraw_denom_inputs.json" node ./scripts/generate_withdraw_verifier_bbjs.mjs
  VERIFIER_MODE="bbjs"
fi
if command -v shasum >/dev/null 2>&1; then
  FINGERPRINT=$(shasum -a 256 ./target/with_foundry.json | cut -d' ' -f1)
else
  FINGERPRINT=$(sha256sum ./target/with_foundry.json 2>/dev/null | cut -d' ' -f1 || echo "unknown")
fi
echo "$FINGERPRINT" > .withdraw-denom-verifier-build-id
mkdir -p ../contract
echo "$FINGERPRINT" > ../contract/.withdraw-denom-verifier-build-id
cp target/Verifier.sol ../contract/WithdrawDenomVerifier.sol
rm -f target/Verifier.sol
echo "Denom withdraw verifier build ID: $FINGERPRINT"

if [ "$VERIFIER_MODE" = "bb" ]; then
  if [ -f WithdrawDenomProver.toml ]; then
    echo "Smoke test (CLI): generating proof with nargo + bb..."
    if nargo execute -p WithdrawDenomProver 2>/dev/null || nargo execute 2>/dev/null; then
      WITNESS_PATH=""
      [ -f "./target/with_foundry.gz" ] && WITNESS_PATH="./target/with_foundry.gz"
      [ -z "$WITNESS_PATH" ] && [ -f "./target/WithdrawDenomProver" ] && WITNESS_PATH="./target/WithdrawDenomProver"
      [ -z "$WITNESS_PATH" ] && [ -f "./target/with_foundry-WithdrawDenomProver" ] && WITNESS_PATH="./target/with_foundry-WithdrawDenomProver"
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
    echo "Warning: WithdrawDenomProver.toml not found, skip CLI smoke test."
  fi
else
  echo "Smoke test (bb.js) already ran during fallback generation."
fi

echo "Done. contract/WithdrawDenomVerifier.sol generated via ${VERIFIER_MODE}."
echo "Wire this verifier into ShieldedPool / router only for Private-buckets withdraw; keep WithdrawVerifier for Standard."
