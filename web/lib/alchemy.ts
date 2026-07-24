import {
  celoMainnet,
  celoSepolia,
  monadMainnet,
  monadTestnet,
} from "@account-kit/infra";
import type { Chain } from "viem";
import { ChainId, type ChainConfig } from "./constants";

/**
 * Cobertura AA Alchemy (Account Kit / Gas Manager) — estado verificado en SDK:
 * - Cadenas en `@account-kit/infra`: Celo mainnet/Sepolia + Monad mainnet/testnet (IDs coinciden).
 * - Paymaster addresses en gas-manager del SDK: cases explícitos para `celoMainnet` y `monadTestnet`.
 * - Celo Sepolia / Monad mainnet: AA asumida vía defs de chain + bundler; sponsorship de Gas Manager
 *   no está listado en el switch de paymaster del SDK — confirmar en dashboard antes de prod.
 */

export const ALCHEMY_API_KEY =
  process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim() || "";

/** Optional — empty means smart account can still be created, but txs are not gas-sponsored. */
export const ALCHEMY_GAS_POLICY_ID =
  process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID?.trim() || "";

export function isAlchemyConfigured(): boolean {
  return Boolean(ALCHEMY_API_KEY);
}

export function isGasSponsorshipConfigured(): boolean {
  return Boolean(ALCHEMY_API_KEY && ALCHEMY_GAS_POLICY_ID);
}

const ALCHEMY_CHAIN_BY_ID: Record<number, Chain> = {
  [ChainId.CELO]: celoMainnet,
  [ChainId.CELO_TESTNET]: celoSepolia,
  [ChainId.MONAD]: monadMainnet,
  [ChainId.MONAD_TESTNET]: monadTestnet,
};

/** Map app ChainConfig → Alchemy Account Kit chain (required by `@getpara/aa-alchemy`). */
export function getAlchemyChain(config: ChainConfig): Chain | null {
  return ALCHEMY_CHAIN_BY_ID[config.id] ?? null;
}
