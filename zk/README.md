# Blizkperse ZK Circuits & Contracts

Noir ZK circuits and Foundry smart contracts for the Blizkperse shielded pool.

> **Withdraw verifier + frontend:** For withdrawals from the web to work, the verifier must be compiled from this repo with `circuits/scripts/compile_withdraw_verifier.sh` and the API must use the same flags (`bb prove --oracle_hash keccak`). See **[docs/BUILD_AND_DEPLOY.md](docs/BUILD_AND_DEPLOY.md)** to avoid SumcheckFailed errors.

## Prerequisites

1. Install [noirup](https://noir-lang.org/docs/getting_started/noir_installation):

   ```bash
   curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
   ```

2. Install Nargo:

   ```bash
   noirup
   ```

3. Install Foundry:

   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

4. Install foundry dependencies:

   ```bash
   forge install 0xnonso/foundry-noir-helper --no-commit
   ```

5. Install [bbup](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/README.md#installation) (Barretenberg CLI manager), then run `bbup`.

## Project Structure

```text
zk/
  circuits/
    src/
      main.nr           # Transfer circuit (deposit commitment)
      withdraw.nr       # Withdraw circuit (claim with ZK proof)
    scripts/            # CLI scripts for deposit, withdraw, proof generation
    WithdrawProver.toml # Prover inputs for the withdraw circuit
  contract/
    Verifier.sol        # HonkVerifier (transfer)
    WithdrawVerifier.sol # WithdrawVerifier (5 public inputs)
  src/
    ShieldedPool.sol    # Main pool contract (deposit, withdraw, Merkle tree)
  script/
    Deploy.s.sol        # Deployment script (deploys all 3 contracts)
  docs/                 # Build, deploy, and testing guides
```

## Generate Verifier Contract

```bash
cd circuits
nargo compile
bb write_vk -b ./target/with_foundry.json
bb contract
```

For the withdraw verifier specifically:

```bash
cd circuits
./scripts/compile_withdraw_verifier.sh
```

## Test with Foundry

```bash
forge test --optimize --optimizer-runs 5000 --evm-version cancun
```

> Optimizer settings are required to suppress "stack too deep" errors in the solc compiler.

## Deploy

```bash
source .env   # PRIVATE_KEY, USDC_ADDRESS, MONAD_RPC (or CELO_RPC)
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

Deploys three contracts: **HonkVerifier**, **WithdrawVerifier**, **ShieldedPool**.

After deploying, update:
- `zk/.env` with the new `POOL_ADDRESS`
- `web/lib/constants.ts` with the new contract addresses and deploy block

## Deployed Contracts

| Chain | ShieldedPool | HonkVerifier | WithdrawVerifier |
| --- | --- | --- | --- |
| **Monad** (143) | `0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c` | `0x6b11b3eB54Bbda485D616150A4C85E8629e1A552` | `0x4d900D53514140755fe842eb3e0d53b12BBcCD24` |
| **Celo** (42220) | `0xcE61001eb3Cd531784D2Cee9DDAbB17a3fc6B16A` | `0x085BD9c0C568BE5093130E2359B00e46cb0800d1` | `0xfe231dd394Df5863B02BfA9CFA50f4877961d5b7` |

## Documentation

- [Build & Deploy Guide](docs/BUILD_AND_DEPLOY.md) — Avoiding SumcheckFailed, deployment checklist
- [Deposit/Withdraw Demo](docs/DEMO_DEPOSIT_WITHDRAW.md) — Step-by-step CLI demo
- [Testing Guide](docs/TEST_DEPOSIT_WITHDRAW.md) — Anonymity validation, proof generation
