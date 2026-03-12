# Blizkperse ZK Circuits & Contracts

Noir ZK circuits and Foundry smart contracts for the Blizkperse shielded pool.

> **Withdraw verifier + frontend:** For withdrawals from the web to work, the verifier must be compiled from this repo with `circuits/scripts/compile_withdraw_verifier.sh` and the API must use the same flags (`bb prove --oracle_hash keccak`). See **[docs/build-and-deploy.md](docs/build-and-deploy.md)** to avoid SumcheckFailed errors.

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

6. Configure environment:

   ```bash
   cp .env.example .env
   # Fill in PRIVATE_KEY, USDC_ADDRESS, RPC URL, and later POOL_ADDRESS after deploy
   ```

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
    ShieldedPool.sol    # Main pool contract (deposit, withdraw, Merkle tree)
    Verifier.sol        # HonkVerifier (transfer)
    WithdrawVerifier.sol # WithdrawVerifier (5 public inputs)
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
- `web/.env` / Railway env vars with the new contract addresses and deploy block

For testnet deployment guidance, see [docs/testnet-deploy.md](docs/testnet-deploy.md).

## Deployed Contracts

### Mainnet

| Chain | ShieldedPool | HonkVerifier | WithdrawVerifier |
| --- | --- | --- | --- |
| **Monad** (143) | `0x97268f95e49bC5C7C8711111cCFe509D76C00674` | `0x4eE52aEb000B91853A5a6f9db9B1f969f1b0c393` | `0x0D70d098085CeD93864B41cD0fF506C2CD329D94` |
| **Celo** (42220) | `0x1aBee1E0205BB4E6d0b95a2C1F5072d9f3064778` | `0x3D76FC7Ce515aB1d69A4e734354c6EC94c22CCb9` | `0x6e4794166dE8Af43D1720f66bA39f561F2C0eD95` |

### Testnet

| Chain | ShieldedPool | Verifier | WithdrawVerifier |
| --- | --- | --- | --- |
| **Monad Testnet** (10143) | `0xcdc6ade9d348572f302690bd39ba8120f8e91db3` | `0x8d10ad45b21d4db2e7270e519a757c764c6501ac` | `0xd9aee9351f7685b05a6b7bd8c1ca509d24be1e57` |
| **Celo Testnet** (11142220) | `0x038803a40130734e6ab711489060ea55f05bb475` | `0x0f86796c3f3254442debd0705a56bdd82c69f4a6` | `0xd850af48bddf6e568a994a870aa684b86bb5054f` |

## Documentation

- [Build & Deploy Guide](docs/build-and-deploy.md) - Avoiding SumcheckFailed, deployment checklist
- [Testnet Deploy Guide](docs/testnet-deploy.md) - Monad testnet and Celo testnet deployment checklist
- [Deposit/Withdraw Demo](docs/demo-deposit-withdraw.md) - Step-by-step CLI demo
- [Testing Guide](docs/test-deposit-withdraw.md) - Anonymity validation, proof generation
