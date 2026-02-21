"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  type SupportedChainId,
  type ChainConfig,
} from "./constants";

interface ChainContextValue {
  chainId: SupportedChainId;
  chain: ChainConfig;
  setChainId: (id: SupportedChainId) => void;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainIdRaw] = useState<SupportedChainId>(DEFAULT_CHAIN_ID);

  const setChainId = useCallback((id: SupportedChainId) => {
    setChainIdRaw(id);
    document.documentElement.setAttribute("data-chain", CHAINS[id].slug);
  }, []);

  return (
    <ChainContext.Provider value={{ chainId, chain: CHAINS[chainId], setChainId }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used within ChainProvider");
  return ctx;
}
