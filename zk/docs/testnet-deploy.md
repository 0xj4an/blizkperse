# Testnet Deploy

This repo can deploy the current verifier/pool stack to:

- Monad testnet (`10143`)
- Celo testnet (`11142220`)

## Assumption

If you have **not changed** `zk/circuits/src/withdraw.nr`, you can deploy using the versioned contract sources already in:

- `zk/contract/Verifier.sol`
- `zk/contract/WithdrawVerifier.sol`
- `zk/contract/ShieldedPool.sol`

You do **not** need to regenerate the withdraw verifier before testnet deploy unless the circuit changed.

## Required inputs per network

- `PRIVATE_KEY`
- `USDC_ADDRESS` for the target testnet
- RPC URL for the target testnet

The deploy script reads:

- `PRIVATE_KEY`
- `USDC_ADDRESS`

And you choose the target chain by passing `--rpc-url`.

## 1. Prepare `zk/.env`

Copy the template:

```bash
cd zk
cp .env.example .env
```

Fill one network at a time.

### Monad testnet example

```bash
PRIVATE_KEY=0x...
USDC_ADDRESS=0x...
MONAD_RPC=https://your-monad-testnet-rpc.example
```

### Celo testnet example

```bash
PRIVATE_KEY=0x...
USDC_ADDRESS=0x...
CELO_RPC=https://your-celo-testnet-rpc.example
```

## 2. Deploy contracts

### Monad testnet

```bash
cd zk
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
```

### Celo testnet

```bash
cd zk
source .env
forge script script/Deploy.s.sol:DeployPool --rpc-url "$CELO_RPC" --broadcast
```

The script prints:

- `chainId`
- `stablecoin`
- `HonkVerifier`
- `WithdrawVerifier`
- `ShieldedPool`

Save all three addresses and the block number of the deployment tx.

## 3. Update `zk/.env` for CLI helpers

After deploy, set:

```bash
POOL_ADDRESS=0x...   # ShieldedPool address
```

This keeps the deposit/withdraw helper scripts pointed at the correct pool.

## 4. Update web / Railway development env vars

Use the new addresses and deploy block in the `web` app environment.

### Monad testnet

```bash
BLIZ_ENV=development
NEXT_PUBLIC_BLIZ_ENV=development
NEXT_PUBLIC_MONAD_CHAIN_ID=10143
NEXT_PUBLIC_MONAD_RPC_URL=https://your-monad-testnet-rpc.example
NEXT_PUBLIC_MONAD_EXPLORER_URL=https://your-monad-testnet-explorer.example
NEXT_PUBLIC_MONAD_POOL_ADDRESS=0x...
NEXT_PUBLIC_MONAD_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_MONAD_WITHDRAW_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_MONAD_STABLECOIN_ADDRESS=0x...
NEXT_PUBLIC_MONAD_DEPLOY_BLOCK=12345678
```

### Celo testnet

```bash
BLIZ_ENV=development
NEXT_PUBLIC_BLIZ_ENV=development
NEXT_PUBLIC_CELO_CHAIN_ID=11142220
NEXT_PUBLIC_CELO_RPC_URL=https://your-celo-testnet-rpc.example
NEXT_PUBLIC_CELO_EXPLORER_URL=https://your-celo-testnet-explorer.example
NEXT_PUBLIC_CELO_POOL_ADDRESS=0x...
NEXT_PUBLIC_CELO_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_CELO_WITHDRAW_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_CELO_STABLECOIN_ADDRESS=0x...
NEXT_PUBLIC_CELO_DEPLOY_BLOCK=23456789
```

## 5. Notes

- The pool still assumes **1 USDC per note** with **6 decimals**.
- If you later change `withdraw.nr`, regenerate `WithdrawVerifier.sol` before deploying again.
- Railway proof generation should use the backend prover (`NoirJS + bb.js`), not `bb` CLI in runtime.
