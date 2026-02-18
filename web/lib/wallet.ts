"use client";

import { useViemClient } from "@getpara/react-sdk/evm/hooks";
import { useAccount } from "@getpara/react-sdk";
import { http, type WalletClient } from "viem";
import { monadMainnet } from "./contracts";
import { MONAD_RPC_URL } from "./constants";

/**
 * Hook that bridges Para SDK's embedded wallet to a viem WalletClient
 * configured for Monad mainnet.
 */
export function useParaWalletClient() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address as `0x${string}` | undefined;

  const { viemClient } = useViemClient({
    address,
    walletClientConfig: {
      chain: monadMainnet,
      transport: http(MONAD_RPC_URL),
    },
  });

  return {
    walletClient: viemClient as WalletClient | null,
    address,
    isReady: !!address && !!viemClient,
  };
}
