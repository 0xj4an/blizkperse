"use client";

import { celoSepolia } from "@account-kit/infra";
import { useAlchemySmartAccount } from "@getpara/react-sdk";
import type { SmartAccount } from "@getpara/viem-v2-integration/aa";
import { useChain } from "./chain-context";
import {
  ALCHEMY_API_KEY,
  ALCHEMY_GAS_POLICY_ID,
  getAlchemyChain,
  isAlchemyConfigured,
  isGasSponsorshipConfigured,
} from "./alchemy";

export type ClaimSmartAccount = SmartAccount;

/**
 * Para + Alchemy ERC-4337 smart account for the selected chain.
 * Enabled only when `NEXT_PUBLIC_ALCHEMY_API_KEY` is set; gas policy is optional.
 *
 * Uses `@getpara/aa-alchemy` via `useAlchemySmartAccount` from `@getpara/react-sdk`
 * (Para 2.16+; npm ^2.16 resolved to 2.32.x — no 2.12 aa-alchemy exists on npm).
 *
 * `mode: "4337"` → Modular Account Alchemy client → EntryPoint v0.6.
 * Chain comes from `getAlchemyChain` (Celo 42220 → celoMainnet). Gas sponsorship
 * requires API key + policy from the same Alchemy app, Active policy, network allowed.
 */
export function useClaimSmartAccount() {
  const { chain } = useChain();
  const alchemyChain = getAlchemyChain(chain);
  const enabled =
    isAlchemyConfigured() && Boolean(alchemyChain) && !chain.placeholder;

  const query = useAlchemySmartAccount({
    apiKey: ALCHEMY_API_KEY || "unused",
    // Hook requires a viem Chain; placeholder unused while `enabled` is false.
    chain: alchemyChain ?? celoSepolia,
    ...(ALCHEMY_GAS_POLICY_ID ? { gasPolicyId: ALCHEMY_GAS_POLICY_ID } : {}),
    mode: "4337",
    enabled,
  });

  const smartAccount = (query.smartAccount ?? null) as ClaimSmartAccount | null;
  const sponsorshipReady = isGasSponsorshipConfigured() && Boolean(smartAccount);

  return {
    smartAccount,
    isLoading: enabled && query.isLoading,
    error: query.error,
    /** Alchemy API key present and Account Kit chain known for current network. */
    alchemyReady: enabled && Boolean(smartAccount),
    /** Policy ID set — claim may be gas-sponsored when smart account is ready. */
    sponsorshipReady,
    isAlchemyConfigured: isAlchemyConfigured(),
    isGasSponsorshipConfigured: isGasSponsorshipConfigured(),
  };
}
