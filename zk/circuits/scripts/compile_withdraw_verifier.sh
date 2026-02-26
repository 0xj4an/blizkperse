#!/bin/bash
# Compila el circuito withdraw y deja el Verifier listo para usar como WithdrawVerifier.
# Uso: desde circuits/ → ./scripts/compile_withdraw_verifier.sh
# Hace: guarda main.nr, usa withdraw.nr como main, nargo compile,
#       genera Verifier.sol con bb y lo copia a ../../contract/WithdrawVerifier.sol, luego restaura main.nr.
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/withdraw.nr src/main.nr
nargo compile

# Generar Verifier.sol con Barretenberg CLI (usa artefacto ./target/with_foundry.json)
bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol

mkdir -p ../contract
cp target/Verifier.sol ../contract/WithdrawVerifier.sol
rm -f target/Verifier.sol
mv "$BACKUP" src/main.nr
echo "Done. contract/WithdrawVerifier.sol generado. (target/Verifier.sol eliminado para que forge build no lo compile.)"
