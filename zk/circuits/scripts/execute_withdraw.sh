#!/bin/bash
# Ejecuta el circuito withdraw con WithdrawProver.toml (genera witness; para proof usa tu pipeline).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak
cp src/main.nr "$BACKUP"
cp src/withdraw.nr src/main.nr
nargo execute -p WithdrawProver
mv "$BACKUP" src/main.nr
echo "Withdraw circuit executed."
