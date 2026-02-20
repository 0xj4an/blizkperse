"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useChain } from "@/lib/chain-context";
import { CHAINS, CHAIN_IDS } from "@/lib/constants";

const CHAIN_COLORS: Record<string, string> = {
  monad: "bg-purple-500",
  celo: "bg-yellow-400",
};

export function ChainSelector() {
  const { chainId, setChainId } = useChain();
  const current = CHAINS[chainId];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${CHAIN_COLORS[current.slug]}`} />
          {current.name}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {CHAIN_IDS.map((id) => {
          const chain = CHAINS[id];
          const isActive = id === chainId;
          return (
            <DropdownMenuItem
              key={id}
              onClick={() => setChainId(id)}
            >
              <span className={`mr-2 h-2 w-2 rounded-full ${CHAIN_COLORS[chain.slug]}`} />
              <span className="flex-1">{chain.name}</span>
              {isActive && (
                <span className="text-[10px] text-muted-foreground">Active</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
