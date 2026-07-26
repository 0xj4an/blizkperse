"use client";

import { useRouter } from "next/navigation";
import { useChain } from "@/lib/chain-context";
import { CHAINS, CHAIN_IDS, type SupportedChainId } from "@/lib/constants";
import { Footer } from "@/components/footer";

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

export default function Home() {
  const router = useRouter();
  const { setChainId } = useChain();

  const handleSelect = (id: SupportedChainId) => {
    setChainId(id);
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center">
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
                  onClick={() => handleSelect(id)}
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
      </main>
      <Footer />
    </div>
  );
}
