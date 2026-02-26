#!/bin/bash
# Compila el circuito withdraw y deja el Verifier listo para usar como WithdrawVerifier.
# Uso: desde circuits/ → ./scripts/compile_withdraw_verifier.sh
# Hace: guarda main.nr, usa withdraw.nr como main, nargo compile,
#       genera Verifier.sol con bb, fingerprint, smoke test (proof+verify), luego restaura main.nr.
# IMPORTANTE: El API (web/app/api/generate-proof) debe usar los MISMOS flags: bb prove --oracle_hash keccak.
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/withdraw.nr src/main.nr
nargo compile

# Generar Verifier.sol con Barretenberg CLI (usa artefacto ./target/with_foundry.json)
bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol

# Fingerprint: mismo build = mismo artefacto (evita desplegar verifier de otra compilación)
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
echo "Verifier build ID: $FINGERPRINT (guardado en .verifier-build-id y contract/.verifier-build-id)"

# Smoke test: proof + verify con el mismo flujo que el API (--oracle_hash keccak)
if [ -f WithdrawProver.toml ]; then
  echo "Smoke test: generating proof (same as API)..."
  nargo execute -p WithdrawProver 2>/dev/null || nargo execute 2>/dev/null || true
  WITNESS_PATH=""
  [ -f "./target/with_foundry.gz" ] && WITNESS_PATH="./target/with_foundry.gz"
  [ -z "$WITNESS_PATH" ] && [ -f "./target/WithdrawProver" ] && WITNESS_PATH="./target/WithdrawProver"
  [ -z "$WITNESS_PATH" ] && [ -f "./target/with_foundry-WithdrawProver" ] && WITNESS_PATH="./target/with_foundry-WithdrawProver"
  if [ -n "$WITNESS_PATH" ] && [ -f "$WITNESS_PATH" ]; then
    bb prove -b ./target/with_foundry.json -w "$WITNESS_PATH" -o ./target --oracle_hash keccak
    bb verify -p ./target/proof -k ./target/vk -i ./target/public_inputs --oracle_hash keccak
    echo "Smoke test: proof verified OK (API would accept this build)."
  else
    echo "Warning: witness not found, skip smoke test. Run ./scripts/prove_withdraw.sh and bb verify manually."
  fi
else
  echo "Warning: WithdrawProver.toml not found, skip smoke test."
fi

mv "$BACKUP" src/main.nr
echo "Done. contract/WithdrawVerifier.sol generado. Redespliega el contrato y actualiza la pool con la nueva dirección si cambió."
