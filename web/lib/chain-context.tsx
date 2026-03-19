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
  CHAIN_IDS,
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
  const [chainId, setChainIdRaw] = useState<SupportedChainId | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem("blizkperse-chain");
    if (stored && CHAIN_IDS.includes(Number(stored) as SupportedChainId)) {
      setChainIdRaw(Number(stored) as SupportedChainId);
      document.documentElement.setAttribute("data-chain", CHAINS[Number(stored) as SupportedChainId].slug);
    } else {
      setChainIdRaw(CHAIN_IDS[0]);
      document.documentElement.setAttribute("data-chain", CHAINS[CHAIN_IDS[0]].slug);
    }
  }, []);

  const setChainId = useCallback((id: SupportedChainId) => {
    setChainIdRaw(id);
    localStorage.setItem("blizkperse-chain", String(id));
    document.documentElement.setAttribute("data-chain", CHAINS[id].slug);
  }, []);

  if (!isMounted || chainId === null) return null;

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
