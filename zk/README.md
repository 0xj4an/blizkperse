# Blizkperse ZK Circuits & Contracts

Noir ZK circuits and Foundry smart contracts for the Blizkperse shielded pools.

> **Withdraw verifier + frontend:** Compile with `circuits/scripts/compile_withdraw_verifier.sh` and prove with `--oracle_hash keccak`. See **[docs/build-and-deploy.md](docs/build-and-deploy.md)** to avoid SumcheckFailed.

> **Current model (arbitrary amounts + multi-token):** **[docs/arbitrary-amounts-multitoken.md](docs/arbitrary-amounts-multitoken.md)** — one pool per token, `PoolRouter`, deposit circuit, protocol fee, registrar-only `registerRoot`. Legacy 1 USDC pools are not migrated.
>
> **Proposed privacy (denominations + batch deposit):** **[docs/private-amounts-and-batch-deposit.md](docs/private-amounts-and-batch-deposit.md)** — private withdraw amounts via buckets; `depositBatch`; no unified multi-token tree.
>
> **Later (after circuits):** **[docs/native-burn-mint-exits.md](docs/native-burn-mint-exits.md)** — claim-time USDC CCTP + USDT0 exits (asset/chain + bridge + platform fees).

## Prerequisites

1. [noirup](https://noir-lang.org/docs/getting_started/noir_installation) + `noirup` (align with `1.0.0-beta.19` for web)
2. [Foundry](https://book.getfoundry.sh) + `forge install`
3. [bbup](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/README.md) / `bb` (prefer bb.js path used by compile scripts when noted)
4. `cp .env.example .env` — `PRIVATE_KEY`, RPC, `TOKEN_ADDRESSES`, `TREASURY_ADDRESS`, `FEE_BPS`, `ROOT_REGISTRAR_ADDRESS`, optional `WRAPPED_NATIVE`

## Project Structure

```text
zk/
  circuits/
    src/
      deposit.nr        # Binds amount ↔ commitment
      withdraw.nr       # Claim / withdraw
      main.nr / pay.nr  # Transfer circuit
    scripts/            # Compile verifiers, CLI deposit/withdraw helpers
  contract/
    PoolRouter.sol
    ShieldedPool.sol
    DepositVerifier.sol
    WithdrawVerifier.sol
    Verifier.sol          # Transfer HonkVerifier
  script/
    DeployDepositVerifier.s.sol
    Deploy.s.sol          # DeployMultiPool, …
    AddPool.s.sol         # Add one pool to an existing router
  docs/
    arbitrary-amounts-multitoken.md
    build-and-deploy.md
    …
```

## Generate Verifiers

```bash
cd circuits
./scripts/compile_deposit_verifier.sh
./scripts/compile_withdraw_verifier.sh
```

## Test

```bash
forge test --optimize --optimizer-runs 5000 --evm-version cancun
```

## Deploy (multi-pool)

```bash
cd zk
source .env
forge script script/DeployDepositVerifier.s.sol:DeployDepositVerifier --rpc-url "$RPC_URL" --broadcast
export DEPOSIT_VERIFIER_ADDRESS=0x...

export TOKEN_ADDRESSES=0xTokenA,0xTokenB
# Monad WMON only — leave unset on Celo
# export WRAPPED_NATIVE=0x...
export FEE_BPS=30
export TREASURY_ADDRESS=0x...
export ROOT_REGISTRAR_ADDRESS=0x...

forge script script/Deploy.s.sol:DeployMultiPool --rpc-url "$RPC_URL" --broadcast
```

Add a token later:

```bash
export POOL_ROUTER_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
# plus verifier addresses as required by AddPool.s.sol
forge script script/AddPool.s.sol:AddPool --rpc-url "$RPC_URL" --broadcast
```

Then set web env: `NEXT_PUBLIC_*_ROUTER_ADDRESS`, `NEXT_PUBLIC_*_POOL_*_ADDRESS`, deposit/withdraw verifiers, `ROOT_REGISTRAR_PRIVATE_KEY`.

## Deployed Contracts (production defaults)

Source of truth: [`web/lib/constants.ts`](../web/lib/constants.ts). Summary:

| Chain | ID | Router | Default pool token |
| --- | --- | --- | --- |
| Monad | 143 | `0x6c1e06C0b652A4F14bD6b4DC647C2BC94e970C47` | USDC `0x80B7399669116f62Aa69B73aA06400EB648E22d2` |
| Celo | 42220 | `0x5aC1F6d71Dd91fcbEDEDeaB07cf07D5FaBCc405c` | USDT `0x228006c6Ba6F0fB7376DC5b69f40Ee570C7369CC` |
| Robinhood | 4663 | `0xB3a0a715ffa799349ccc06F6e6169C96c97EfDc8` | USDG `0x481C87F6fe1f75238523DD8f5d386Fb8A8428A19` |

Per-token pools, deposit/withdraw/honk verifiers, and deploy blocks are listed in the [root README](../README.md#supported-chains).

### Testnet

Legacy single-pool USDC addresses remain for Monad testnet (10143) and Celo testnet (11142220) when `BLIZ_ENV=development`. Prefer multi-pool mainnet flow for new work.

## Documentation

| Doc | Description |
| --- | --- |
| [arbitrary-amounts-multitoken.md](docs/arbitrary-amounts-multitoken.md) | Router, fees, registrar, deposit circuit |
| [private-amounts-and-batch-deposit.md](docs/private-amounts-and-batch-deposit.md) | Proposed: denomination withdraw + batch deposit |
| [native-burn-mint-exits.md](docs/native-burn-mint-exits.md) | Later: claim-time USDC/USDT exit + fees |
| [build-and-deploy.md](docs/build-and-deploy.md) | Verifier fingerprints, SumcheckFailed |
| [demo-deposit-withdraw.md](docs/demo-deposit-withdraw.md) | CLI demo (may include legacy notes) |
| [test-deposit-withdraw.md](docs/test-deposit-withdraw.md) | Testing notes |
| [testnet-deploy.md](docs/testnet-deploy.md) | Testnet guidance |
