#!/bin/bash
# Genera un proof Honk/Barretenberg para el circuito withdraw.
# Requiere: nargo, bb (Barretenberg CLI). WithdrawProver.toml con los inputs.
# Uso: desde circuits/ → ./scripts/prove_withdraw.sh
# Salida: circuits/proofs/withdraw.proof (hex) y target/proof, target/public_inputs (binario).
set -e
cd "$(dirname "$0")/.."
BACKUP=src/main.nr.bak

# 1. Withdraw como main
cp src/main.nr "$BACKUP" 2>/dev/null || true
cp src/withdraw.nr src/main.nr

# 2. Compilar y generar witness
nargo compile
nargo execute -p WithdrawProver

# 3. Probar con bb (Barretenberg). Nargo guarda el witness como target/<package>.gz (Nargo.toml name=with_foundry).
WITNESS_PATH=""
[ -f "./target/with_foundry.gz" ] && WITNESS_PATH="./target/with_foundry.gz"
[ -z "$WITNESS_PATH" ] && [ -f "./target/WithdrawProver" ] && WITNESS_PATH="./target/WithdrawProver"
[ -z "$WITNESS_PATH" ] && [ -f "./target/with_foundry-WithdrawProver" ] && WITNESS_PATH="./target/with_foundry-WithdrawProver"
if [ -z "$WITNESS_PATH" ] || ! [ -f "$WITNESS_PATH" ]; then
  echo "Witness no encontrado. Buscando en target/..."
  ls -la target/ 2>/dev/null || true
  echo "Ajusta WITNESS_PATH en este script (p. ej. ./target/with_foundry.gz) y vuelve a ejecutar."
  mv "$BACKUP" src/main.nr 2>/dev/null || true
  exit 1
fi
echo "Usando witness: $WITNESS_PATH"

# Escribir la vk del circuito withdraw (target/vk) para que bb prove y bb verify usen la misma key.
# Si no hacemos esto, target/vk puede ser del circuito transfer y el sumcheck falla.
bb write_vk -b ./target/with_foundry.json -o ./target --oracle_hash keccak

bb prove -b ./target/with_foundry.json -w "$WITNESS_PATH" -o ./target --oracle_hash keccak

# 4. Convertir proof binario a hex para withdraw_one.mjs
mkdir -p proofs
if [ -f ./target/proof ]; then
  node -e "
  const fs = require('fs');
  const p = fs.readFileSync('./target/proof');
  fs.writeFileSync('./proofs/withdraw.proof', '0x' + p.toString('hex'));
  console.log('Proof hex escrito en proofs/withdraw.proof,', p.length, 'bytes (', p.length/32, ' field elements)');
  "
else
  echo "No se encontró target/proof. Revisa la salida de 'bb prove'."
fi

# 5. Restaurar main.nr
mv "$BACKUP" src/main.nr 2>/dev/null || true

echo "Listo. Para enviar el withdraw:"
echo "  Desde circuits/: PROOF_FILE=proofs/withdraw.proof node scripts/withdraw_one.mjs"
echo "  Desde repo root: PROOF_FILE=circuits/proofs/withdraw.proof node scripts/withdraw_one.mjs"
echo ""
echo "Verificar proof localmente con bb: bb verify -p ./target/proof -k ./target/vk -i ./target/public_inputs --oracle_hash keccak"
