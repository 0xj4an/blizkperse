"use client";

import Link from "next/link";
import { useAccount, useModal, useLogout } from "@getpara/react-sdk";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChainSelector } from "@/components/chain-selector";
import { LogIn, ChevronDown, LayoutDashboard, HandCoins, LogOut, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllBalances } from "@/lib/contracts";
import { useChain } from "@/lib/chain-context";
import type { Hex } from "viem";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();
  const { chain } = useChain();
  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  const address = embedded?.wallets?.[0]?.address;

  useEffect(() => {
    if (!address) return;
    getAllBalances(chain, address as Hex).then(setBalances).catch(() => {});
    const interval = setInterval(() => {
      getAllBalances(chain, address as Hex).then(setBalances).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [address, chain.id]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center text-primary transition-colors duration-500">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 56" fill="none" className="h-8 w-auto" aria-label="Blizkperse">
              <g transform="translate(2, 2)">
                <path
                  d="M26 4L6 14v14c0 12.5 8.5 24.2 20 27 11.5-2.8 20-14.5 20-27V14L26 4z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  fill="none"
                  opacity="0.7"
                />
                <circle cx="26" cy="24" r="5" stroke="white" strokeWidth="1.8" fill="none" />
                <line x1="26" y1="29" x2="26" y2="35" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </g>
              <text x="62" y="38" fontFamily="'Geist', 'Inter', ui-monospace, monospace" fontSize="28" fontWeight="700" fill="white" letterSpacing="-0.01em" opacity="0.9">blizkperse</text>
            </svg>
          </Link>

          {isConnected && (
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/payer">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <HandCoins className="mr-1.5 h-4 w-4" />
                  Distribute
                </Button>
              </Link>
              <Link href="/receive">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  Receive
                </Button>
              </Link>
            </nav>
          )}
        </div>

        {/* Chain Selector + Wallet */}
        <div className="flex items-center gap-2">
          <ChainSelector />

          {isConnected && address ? (
            <>
              {/* Balances */}
              {Object.keys(balances).length > 0 && (
                <div className="hidden items-center gap-1.5 md:flex">
                  {chain.tokens.map((t) => {
                    const raw = balances[t.symbol];
                    if (raw === undefined) return null;
                    const formatted = Number(raw) / 10 ** t.decimals;
                    return (
                      <Badge key={t.symbol} variant="outline" className="gap-1 font-mono text-xs">
                        {formatted < 0.01 && formatted > 0
                          ? "<0.01"
                          : formatted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="text-muted-foreground">{t.symbol}</span>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1.5 font-mono text-xs transition-colors hover:bg-secondary/80"
                onClick={(e) => { e.stopPropagation(); copyAddress(); }}
              >
                {copied ? "Copied!" : truncateAddress(address)}
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {/* Mobile balances */}
                  {Object.keys(balances).length > 0 && (
                    <>
                      <div className="px-2 py-1.5 md:hidden">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Balances</p>
                        {chain.tokens.map((t) => {
                          const raw = balances[t.symbol];
                          if (raw === undefined) return null;
                          const formatted = Number(raw) / 10 ** t.decimals;
                          return (
                            <div key={t.symbol} className="flex items-center justify-between py-0.5 text-sm">
                              <span>{t.symbol}</span>
                              <span className="font-mono">
                                {formatted < 0.01 && formatted > 0
                                  ? "<0.01"
                                  : formatted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <DropdownMenuSeparator className="md:hidden" />
                    </>
                  )}
                  <Link href="/payer" className="md:hidden">
                    <DropdownMenuItem>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Organizer Dashboard
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/receive" className="md:hidden">
                    <DropdownMenuItem>
                      <HandCoins className="mr-2 h-4 w-4" />
                      Recipient Dashboard
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator className="md:hidden" />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button size="sm" onClick={() => openModal()} className="gap-2">
              <LogIn className="h-4 w-4" />
              Log In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
