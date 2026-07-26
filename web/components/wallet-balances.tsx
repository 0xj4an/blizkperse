"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { useChain } from "@/lib/chain-context";
import { fromTokenRawAmount } from "@/lib/constants";
import { getAllBalances } from "@/lib/contracts";

type Props = {
  address?: string;
  /** When set, highlight this symbol in the strip. */
  highlightSymbol?: string;
  className?: string;
};

/**
 * On-chain balances for the connected wallet on the selected chain.
 * Uses our configured token list (not Para's USD profile balance).
 */
export function WalletBalances({ address, highlightSymbol, className }: Props) {
  const { chain } = useChain();
  const [balances, setBalances] = useState<Record<string, bigint> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || chain.placeholder) {
      setBalances(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setBalances(null);
    setError(null);

    (async () => {
      try {
        const next = await getAllBalances(chain, address as Hex);
        if (!cancelled) setBalances(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load balances");
          setBalances(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, chain]);

  if (!address || chain.placeholder) return null;

  return (
    <div className={className}>
      <p className="mb-1.5 text-xs text-muted-foreground">
        Wallet on {chain.name}
      </p>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !balances ? (
        <p className="text-xs text-muted-foreground">Loading balances…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chain.tokens.map((t) => {
            const raw = balances[t.symbol] ?? 0n;
            const human = fromTokenRawAmount(raw, t.decimals);
            const active = highlightSymbol === t.symbol;
            return (
              <span
                key={t.symbol}
                className={`rounded-md border px-2 py-1 font-mono text-xs ${
                  active
                    ? "border-foreground/30 bg-foreground/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {human.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                {t.symbol}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
