import {
  celoMainnet,
  celoSepolia,
  monadMainnet,
  monadTestnet,
} from "@account-kit/infra";
import type { Chain } from "viem";
import { ChainId, type ChainConfig } from "./constants";

/**
 * Alchemy AA (Account Kit / Gas Manager) coverage verified in SDK:
 * - Chains in `@account-kit/infra`: Celo mainnet/Sepolia + Monad mainnet/testnet (IDs match).
 * - Paymaster addresses: explicit cases for `celoMainnet` and `monadTestnet`.
 * - Celo Sepolia / Monad mainnet: AA via chain defs + bundler; confirm Gas Manager
 *   sponsorship in the Alchemy dashboard before production.
 *
 * Para `mode: "4337"` uses Modular Account → EntryPoint **v0.6**
 * (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`). That is expected, not a bug.
 *
 * Gas Manager checklist (avoids `Policy ID(s) not found`):
 * 1. `NEXT_PUBLIC_ALCHEMY_API_KEY` and `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` belong to the **same** Alchemy app.
 * 2. Policy status is **Active**.
 * 3. Policy networks include the claim chain (e.g. **Celo Mainnet 42220**).
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

const ALCHEMY_SPONSORSHIP_USER_MESSAGE =
  "Oops, we are out of funds! Sponsored transaction failed — please try again later.";

function errorToRawString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Turn Alchemy / Para AA paymaster failures into short user-facing English copy.
 * Returns null when the error is unrelated to Gas Manager / sponsorship.
 * Detailed reason is logged for developers only (no Policy ID in the UI).
 */
export function formatAlchemyPaymasterError(err: unknown): string | null {
  const raw = errorToRawString(err);
  const lower = raw.toLowerCase();
  const isPaymaster =
    lower.includes("policy id") ||
    lower.includes("requestgasandpaymaster") ||
    lower.includes("gas manager") ||
    lower.includes("paymaster") ||
    (lower.includes("policy") && lower.includes("not found"));
  if (!isPaymaster) return null;

  console.warn("[alchemy] Gas Manager / sponsorship error:", raw, {
    policyIdConfigured: Boolean(ALCHEMY_GAS_POLICY_ID),
  });

  return ALCHEMY_SPONSORSHIP_USER_MESSAGE;
}
