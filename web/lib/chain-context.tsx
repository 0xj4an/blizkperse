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

const CHAIN_COLORS: Record<string, string> = {
  monad: "from-purple-500 to-purple-700",
  celo: "from-yellow-400 to-yellow-600",
};

function ChainSelectScreen({
  onSelect,
}: {
  onSelect: (id: SupportedChainId) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="mx-4 w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="gradient-text text-3xl font-bold tracking-tight">
            Welcome to Blizkperse
          </h1>
          <p className="text-muted-foreground">
            Select a network to get started
          </p>
        </div>

        <div className="space-y-3">
          {CHAIN_IDS.map((id) => {
            const chain = CHAINS[id];
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className="glass group flex w-full items-center gap-4 rounded-xl border border-border/50 p-4 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
              >
                <span
                  className={`h-3 w-3 rounded-full bg-gradient-to-br ${CHAIN_COLORS[chain.slug]}`}
                />
                <span className="text-sm font-medium text-foreground">
                  {chain.name}
                </span>
                <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  Select &rarr;
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainIdRaw] = useState<SupportedChainId | null>(null);

  const setChainId = useCallback((id: SupportedChainId) => {
    setChainIdRaw(id);
    document.documentElement.setAttribute("data-chain", CHAINS[id].slug);
  }, []);

  if (chainId === null) {
    return <ChainSelectScreen onSelect={setChainId} />;
  }

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
