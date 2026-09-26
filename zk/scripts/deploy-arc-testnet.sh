#!/usr/bin/env bash
# Greenfield deploy on Arc Testnet (chain id 5042002).
# USDC is native gas + ERC-20 at 0x3600... (use 6dp for pool logic). EURC is a separate ERC-20.
#
# Arc enforces EIP-170 (24 576 byte runtime limit). UltraHonk deposit/withdraw verifiers
# exceed that at optimizer_runs=200 — this script uses FOUNDRY_PROFILE=eip170 (runs=1).
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

export FOUNDRY_PROFILE=eip170
export ARC_RPC="${ARC_RPC_TESTNET:-https://rpc.testnet.arc.io}"
export ARC_USDC_ADDRESS="${ARC_USDC_ADDRESS:-0x3600000000000000000000000000000000000000}"
export ARC_EURC_ADDRESS="${ARC_EURC_ADDRESS:-0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a}"
# IMPORTANT: do not reuse Monad/Robinhood TOKEN_ADDRESSES
export TOKEN_ADDRESSES="${ARC_USDC_ADDRESS},${ARC_EURC_ADDRESS}"
export WRAPPED_NATIVE=0x0000000000000000000000000000000000000000
export DENOM_KIND=stables6
export FEE_BPS="${FEE_BPS:-30}"

: "${PRIVATE_KEY:?}"
: "${TREASURY_ADDRESS:?}"
: "${ROOT_REGISTRAR_ADDRESS:?}"

echo "FOUNDRY_PROFILE=$FOUNDRY_PROFILE"
echo "RPC=$ARC_RPC"
cast chain-id --rpc-url "$ARC_RPC"
DEP=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "deployer=$DEP"
echo "native_wei=$(cast balance "$DEP" --rpc-url "$ARC_RPC")"
echo "usdc_erc20=$(cast call "$ARC_USDC_ADDRESS" "balanceOf(address)(uint256)" "$DEP" --rpc-url "$ARC_RPC")"
echo "eurc=$(cast call "$ARC_EURC_ADDRESS" "balanceOf(address)(uint256)" "$DEP" --rpc-url "$ARC_RPC")"

echo "==> forge build (eip170 / optimizer_runs=1)"
forge build

echo "==> DeployDepositVerifier"
forge script script/DeployDepositVerifier.s.sol:DeployDepositVerifier \
  --rpc-url "$ARC_RPC" --broadcast -vvv | tee /tmp/arc-deposit-verifier.log

# Prefer successful CREATE receipt address over simulation-only Return line.
DV=$(
  python3 - <<'PY'
import json, re, sys
log=open("/tmp/arc-deposit-verifier.log").read()
# broadcast file is authoritative if present
try:
  j=json.load(open("broadcast/DeployDepositVerifier.s.sol/5042002/run-latest.json"))
  for r in j.get("receipts",[]):
    if r.get("status")=="0x1" and r.get("contractAddress"):
      # skip ZKTranscriptLib-only success; DepositHonkVerifier CREATE has contractAddress on failed or success
      pass
  for t,r in zip(j.get("transactions",[]), j.get("receipts",[])):
    if t.get("contractName")=="DepositHonkVerifier" and r.get("status")=="0x1":
      print(r.get("contractAddress") or t.get("contractAddress"))
      sys.exit(0)
except Exception:
  pass
m=re.findall(r"DepositVerifier\s+(0x[a-fA-F0-9]{40})", log)
print(m[-1] if m else "")
PY
)
if [[ -z "${DV:-}" ]]; then
  echo "DepositVerifier deploy failed or address not found. Check /tmp/arc-deposit-verifier.log"
  echo "Common cause: EIP-170 — ensure FOUNDRY_PROFILE=eip170 rebuild before broadcast."
  exit 1
fi
# Verify code exists
CODE=$(cast code "$DV" --rpc-url "$ARC_RPC")
if [[ "$CODE" == "0x" || -z "$CODE" ]]; then
  echo "Address $DV has no code — CREATE failed (likely EIP-170). Rebuild with eip170 and retry."
  exit 1
fi
export DEPOSIT_VERIFIER_ADDRESS="$DV"
echo "DEPOSIT_VERIFIER_ADDRESS=$DEPOSIT_VERIFIER_ADDRESS"

echo "==> DeployMultiPool (USDC+EURC, denoms stables6)"
forge script script/Deploy.s.sol:DeployMultiPool \
  --rpc-url "$ARC_RPC" --broadcast -vvv | tee /tmp/arc-multipool.log

echo "==> DeployWithdrawDenomVerifier (Private claim)"
forge script script/DeployWithdrawDenomVerifier.s.sol:DeployWithdrawDenomVerifier \
  --rpc-url "$ARC_RPC" --broadcast -vvv | tee /tmp/arc-withdraw-denom-verifier.log

WDV=$(
  python3 - <<'PY'
import re
log=open("/tmp/arc-withdraw-denom-verifier.log").read()
m=re.findall(r"WithdrawDenomVerifier\s+(0x[a-fA-F0-9]{40})", log)
print(m[-1] if m else "")
PY
)
if [[ -z "${WDV:-}" ]]; then
  echo "WithdrawDenomVerifier deploy failed. Check /tmp/arc-withdraw-denom-verifier.log"
  exit 1
fi
CODE=$(cast code "$WDV" --rpc-url "$ARC_RPC")
if [[ "$CODE" == "0x" || -z "$CODE" ]]; then
  echo "Address $WDV has no code — CREATE failed (likely EIP-170)."
  exit 1
fi
export WITHDRAW_DENOM_VERIFIER_ADDRESS="$WDV"
echo "WITHDRAW_DENOM_VERIFIER_ADDRESS=$WITHDRAW_DENOM_VERIFIER_ADDRESS"

# Resolve pools from multipool log if POOL_ADDRESSES unset
if [[ -z "${POOL_ADDRESSES:-}" ]]; then
  POOL_ADDRESSES=$(
    python3 - <<'PY'
import re
log=open("/tmp/arc-multipool.log").read()
pools=re.findall(r"pool (0x[a-fA-F0-9]{40})", log)
# unique preserve order
seen=set(); out=[]
for p in pools:
  pl=p.lower()
  if pl not in seen:
    seen.add(pl); out.append(p)
print(",".join(out))
PY
  )
  export POOL_ADDRESSES
fi
echo "POOL_ADDRESSES=$POOL_ADDRESSES"

echo "==> SetWithdrawDenomVerifier on pools"
forge script script/SetWithdrawDenomVerifier.s.sol:SetWithdrawDenomVerifier \
  --rpc-url "$ARC_RPC" --broadcast -vvv

echo "Done. Save PoolRouter + pool addresses from the log into web NEXT_PUBLIC_ARC_* env."
echo "WITHDRAW_DENOM_VERIFIER_ADDRESS=$WITHDRAW_DENOM_VERIFIER_ADDRESS"
