#!/bin/bash
# Imprime nullifier y expected_merkle_root para PAYMENT_INDEX=0 (pk_b=2, random=100).
# Pega los valores en WithdrawProver.toml (nullifier y expected_merkle_root).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/nullifier_helper.nr src/main.nr
nargo execute 2>&1
mv "$BACKUP" src/main.nr
