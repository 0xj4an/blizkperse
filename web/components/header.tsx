"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useModal, useLogout, useExportPrivateKey } from "@getpara/react-sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChainSelector } from "@/components/chain-selector";
import { LogIn, ChevronDown, LogOut, Copy, Check, KeyRound, Send, HandCoins } from "lucide-react";
import { useState } from "react";
import { useChain } from "@/lib/chain-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/payer", label: "Send", icon: Send },
  { href: "/receive", label: "Get paid", icon: HandCoins },
] as const;

export function Header() {
  const pathname = usePathname();
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();
  const exportKey = useExportPrivateKey();
  useChain();
  const [copied, setCopied] = useState(false);

  const address = embedded?.wallets?.[0]?.address;
  const sessionEmail =
    typeof embedded?.email === "string" && embedded.email.trim()
      ? embedded.email.trim()
      : null;

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-primary" aria-label="Blizkperse home">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 56" fill="none" className="h-8 w-8" aria-hidden="true">
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
            </svg>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">blizkperse</span>
          </Link>

          {isConnected && (
            <nav className="flex items-center">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                    <Button
                      variant={active ? "secondary" : "ghost"}
                      size="sm"
                      className={cn("gap-1.5 px-2 sm:px-3", active && "text-foreground")}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ChainSelector />

          {isConnected && address ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyAddress();
                }}
                className="flex max-w-[9rem] flex-col items-start rounded-md bg-secondary px-2.5 py-1 text-left sm:max-w-[14rem]"
                title={copied ? "Copied" : "Copy wallet address"}
              >
                <span className="flex w-full items-center gap-1.5 text-xs leading-tight">
                  <span className="truncate">{copied ? "Copied" : sessionEmail ?? "Wallet"}</span>
                  {copied ? (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Account menu">
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <div className="px-2 py-1.5">
                    {sessionEmail ? (
                      <p className="truncate text-sm">{sessionEmail}</p>
                    ) : (
                      <p className="text-sm">Signed in</p>
                    )}
                    <p className="mt-1 break-all font-mono text-[11px] leading-snug text-muted-foreground">
                      {address}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  {NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} className="sm:hidden">
                        <DropdownMenuItem>
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    );
                  })}
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem
                    onClick={() => exportKey.mutate({ walletId: embedded?.wallets?.[0]?.id })}
                    disabled={exportKey.isPending}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    {exportKey.isPending ? "Exporting..." : "Export private key"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button size="sm" onClick={() => openModal()} className="gap-2">
              <LogIn className="h-4 w-4" />
              Log in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
