#!/bin/bash
# Calcula expected_merkle_root y merkle_proof_siblings con el mismo Poseidon que el circuito.
# Copia root y la lista de siblings a WithdrawProver.toml (reemplaza expected_merkle_root y merkle_proof_siblings).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/merkle_root_helper.nr src/main.nr
nargo execute 2>&1
mv "$BACKUP" src/main.nr
