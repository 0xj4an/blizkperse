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

const CHAIN_DOT: Record<string, string> = {
  monad: "bg-purple-500",
  celo: "bg-yellow-400",
};

// prettier-ignore
const ASCII_ART = `
██████╗ ██╗     ██╗███████╗██╗  ██╗
██╔══██╗██║     ██║╚══███╔╝██║ ██╔╝
██████╔╝██║     ██║  ███╔╝ █████╔╝
██╔══██╗██║     ██║ ███╔╝  ██╔═██╗
██████╔╝███████╗██║███████╗██║  ██╗
╚═════╝ ╚══════╝╚═╝╚══════╝╚═╝  ╚═╝
██████╗ ███████╗██████╗ ███████╗███████╗
██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗  ██████╔╝███████╗█████╗
██╔═══╝ ██╔══╝  ██╔══██╗╚════██║██╔══╝
██║     ███████╗██║  ██║███████║███████╗
╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝`;

function ChainSelectScreen({
  onSelect,
}: {
  onSelect: (id: SupportedChainId) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="mx-4 w-full max-w-lg space-y-8 text-center">
        <div className="space-y-4">
          <pre
            className="hidden select-none overflow-hidden text-center font-mono text-[0.45rem] leading-[1.1] text-foreground/70 sm:block sm:text-[0.55rem] md:text-xs"
            aria-hidden="true"
          >
            {ASCII_ART}
          </pre>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:hidden">
            BLIZKPERSE
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
                className="glass group flex w-full items-center gap-4 rounded-xl border border-border/50 p-4 text-left transition-all hover:border-foreground/30 hover:shadow-lg"
              >
                <span
                  className={`h-3 w-3 rounded-full ${CHAIN_DOT[chain.slug]}`}
                />
                <span className="flex-1 text-sm font-medium text-foreground">
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem("blizkperse-chain");
    if (stored && CHAIN_IDS.includes(Number(stored) as SupportedChainId)) {
      setChainIdRaw(Number(stored) as SupportedChainId);
      document.documentElement.setAttribute("data-chain", CHAINS[Number(stored) as SupportedChainId].slug);
    }
  }, []);

  const setChainId = useCallback((id: SupportedChainId) => {
    setChainIdRaw(id);
    localStorage.setItem("blizkperse-chain", String(id));
    document.documentElement.setAttribute("data-chain", CHAINS[id].slug);
  }, []);

  if (!isMounted) return null;

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
