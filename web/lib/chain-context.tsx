"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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

const STORAGE_KEY = "blizkperse-chain";

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainIdRaw] = useState<SupportedChainId>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Number(stored) in CHAINS)
        return Number(stored) as SupportedChainId;
    }
    return DEFAULT_CHAIN_ID;
  });

  const setChainId = useCallback((id: SupportedChainId) => {
    setChainIdRaw(id);
    localStorage.setItem(STORAGE_KEY, String(id));
    document.documentElement.setAttribute("data-chain", CHAINS[id].slug);
  }, []);

  // Set data-chain on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-chain", CHAINS[chainId].slug);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
