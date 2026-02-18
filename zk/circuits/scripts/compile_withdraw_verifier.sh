#!/bin/bash
# Compila el circuito withdraw y deja el Verifier listo para usar como WithdrawVerifier.
# Uso: desde circuits/ → ./scripts/compile_withdraw_verifier.sh
# Hace: guarda main.nr, usa withdraw.nr como main, nargo compile, copia target/Verifier.sol a ../../contract/WithdrawVerifier.sol, restaura main.nr.
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/withdraw.nr src/main.nr
nargo compile
mkdir -p ../contract
cp target/Verifier.sol ../contract/WithdrawVerifier.sol
mv "$BACKUP" src/main.nr
echo "Done. contract/WithdrawVerifier.sol generado. Dentro del archivo renombra 'contract HonkVerifier' a 'contract WithdrawVerifier' para evitar conflicto con el Verifier del transfer."
