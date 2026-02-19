"use client";

import { useViemClient } from "@getpara/react-sdk/evm/hooks";
import { useAccount } from "@getpara/react-sdk";
import { http, type WalletClient } from "viem";
import { useChain } from "./chain-context";
import { buildViemChain } from "./contracts";

/**
 * Hook that bridges Para SDK's embedded wallet to a viem WalletClient
 * configured for the currently selected chain.
 */
export function useParaWalletClient() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address as `0x${string}` | undefined;
  const { chain } = useChain();

  const { viemClient } = useViemClient({
    address,
    walletClientConfig: {
      chain: buildViemChain(chain),
      transport: http(chain.rpcUrl),
    },
  });

  return {
    walletClient: viemClient as WalletClient | null,
    address,
    isReady: !!address && !!viemClient,
  };
}
