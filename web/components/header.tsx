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
import { Wallet, ChevronDown, LayoutDashboard, HandCoins, LogOut } from "lucide-react";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();

  const address = embedded?.wallets?.[0]?.address;

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">B</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Blizkperse
          </span>
        </Link>

        {/* Nav links (visible when connected) */}
        {isConnected && (
          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/payer">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <LayoutDashboard className="mr-1.5 h-4 w-4" />
                Payer
              </Button>
            </Link>
            <Link href="/receive">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <HandCoins className="mr-1.5 h-4 w-4" />
                Receive
              </Button>
            </Link>
          </nav>
        )}

        {/* Wallet / Connect */}
        {isConnected && address ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Wallet className="h-4 w-4" />
                <Badge variant="secondary" className="font-mono text-xs">
                  {truncateAddress(address)}
                </Badge>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <Link href="/payer" className="md:hidden">
                <DropdownMenuItem>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Payer Dashboard
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
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" onClick={() => openModal()} className="gap-2">
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
