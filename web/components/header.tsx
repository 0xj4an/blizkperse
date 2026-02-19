"use client";

import Link from "next/link";
import Image from "next/image";
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
import { LogIn, ChevronDown, LayoutDashboard, HandCoins, LogOut, Copy, Check, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { getAllBalances } from "@/lib/contracts";
import { SUPPORTED_TOKENS } from "@/lib/constants";
import type { Hex } from "viem";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();
  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  const address = embedded?.wallets?.[0]?.address;

  useEffect(() => {
    if (!address) return;
    getAllBalances(address as Hex).then(setBalances).catch(() => {});
    const interval = setInterval(() => {
      getAllBalances(address as Hex).then(setBalances).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [address]);

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
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Blizkperse"
              width={160}
              height={40}
              className="h-8 w-auto"
              priority
            />
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

        {/* Wallet / Connect */}
        {isConnected && address ? (
          <div className="flex items-center gap-2">
            {/* Balances */}
            {Object.keys(balances).length > 0 && (
              <div className="hidden items-center gap-1.5 md:flex">
                {SUPPORTED_TOKENS.map((t) => {
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
                    {SUPPORTED_TOKENS.map((t) => {
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
          </div>
        ) : (
          <Button size="sm" onClick={() => openModal()} className="gap-2">
            <LogIn className="h-4 w-4" />
            Log In
          </Button>
        )}
      </div>
    </header>
  );
}
