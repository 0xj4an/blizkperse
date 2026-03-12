"use client";

import { useState, useEffect } from "react";
import { useAccount, useClient } from "@getpara/react-sdk";
import { createWalletClient, http, type WalletClient } from "viem";
import { createParaAccount } from "@getpara/viem-v2-integration";
import { useChain } from "./chain-context";
import { buildViemChain } from "./contracts";

/**
 * Hook that bridges Para SDK's embedded wallet to a viem WalletClient
 * configured for the currently selected chain.
 */
export function useParaWalletClient() {
  const para = useClient();
  const { embedded, isConnected } = useAccount();
  const embeddedWallet = embedded?.wallets?.[0];
  const address = embeddedWallet?.address as `0x${string}` | undefined;
  const { chain } = useChain();

  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  useEffect(() => {
    console.log("useParaWalletClient trigger:", { 
      para: !!para, 
      address, 
      rpc: chain.rpcUrl, 
      placeholder: chain.placeholder, 
      isConnected,
      embeddedIsConnected: embedded?.isConnected,
      chain 
    });
    // In some versions of Para, isConnected might be false if no external wallet, but embedded is connected. Let's just rely on address existing.
    if (!para || !address || !chain.rpcUrl || chain.placeholder) {
      setWalletClient(null);
      return;
    }

    try {
      const client = createWalletClient({
        account: createParaAccount(para, address),
        chain: buildViemChain(chain),
        transport: http(chain.rpcUrl),
      });
      setWalletClient(client as WalletClient);
    } catch (error) {
      console.warn("Failed to create Para wallet client", error);
      // Retry in 500ms once if wallets aren't populated yet
      const timer = setTimeout(() => {
        try {
          const retryClient = createWalletClient({
            account: createParaAccount(para, address),
            chain: buildViemChain(chain),
            transport: http(chain.rpcUrl),
          });
          setWalletClient(retryClient as WalletClient);
        } catch (e) {
          console.error("Retry failed to create Para wallet client", e);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [para, address, chain, isConnected]);

  return {
    walletClient,
    address,
    isReady: !!address && !!walletClient && !chain.placeholder,
  };
}
