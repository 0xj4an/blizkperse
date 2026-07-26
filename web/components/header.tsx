"use client";

import Link from "next/link";
import { useAccount, useModal, useLogout, useExportPrivateKey } from "@getpara/react-sdk";
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
import { LogIn, ChevronDown, LayoutDashboard, HandCoins, LogOut, Copy, Check, KeyRound } from "lucide-react";
import { useState } from "react";
import { useChain } from "@/lib/chain-context";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();
  const { exportPrivateKey, isPending: isExporting } = useExportPrivateKey();
  useChain();
  const [copied, setCopied] = useState(false);

  const address = embedded?.wallets?.[0]?.address;

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
                <circle cx="26" cy="24" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" opacity="0.9" />
                <line x1="26" y1="29" x2="26" y2="35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
              </g>
              <text x="62" y="38" fontFamily="'Geist', 'Inter', ui-monospace, monospace" fontSize="28" fontWeight="700" fill="currentColor" letterSpacing="-0.01em" opacity="0.9">blizkperse</text>
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
                    onClick={() => exportPrivateKey({ walletId: embedded?.wallets?.[0]?.id })}
                    disabled={isExporting}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    {isExporting ? "Exporting..." : "Export Private Key"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
